'use strict';

/**
 * smtp.provider.js — envío por SMTP con Nodemailer (EMAIL_PROVIDER=smtp).
 *
 * Para desarrollo local (p. ej. Gmail con App Password) o un hosting que
 * permita SMTP saliente. En Render Free NO sirve: bloquea los puertos 25/465/587
 * (ahí se usa brevo.provider.js).
 *
 * Nodemailer se carga recién al primer uso: con EMAIL_PROVIDER=brevo nunca se
 * inicializa ni se intenta conectar al puerto 587.
 *
 * Contrato (común a los proveedores; `cfg` = config.email que pasa la
 * fachada utils/mailer.js — los proveedores no leen el singleton de config):
 *   send({ to, subject, html }, cfg) → { ok: true, messageId } | { ok: false, errorCode, categoria, detalle }
 *   verify(cfg)                      → { ok: true } | { ok: false, errorCode, categoria, detalle }
 *   resumen(cfg)                     → datos NO sensibles para logs / email:verify
 */

const { redactarEmail, primeraLinea } = require('../comun');

// Timeouts acotados: sin ellos Nodemailer espera hasta 2 minutos una conexión
// que nunca llega (p. ej. si el hosting bloquea el SMTP saliente).
const TIMEOUTS = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
};

let _transporter = null;

function getTransporter(cfg) {
  if (_transporter) return _transporter;
  const nodemailer = require('nodemailer'); // lazy: solo si el proveedor es smtp
  const c = cfg.smtp;
  _transporter = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    // EMAIL_SECURE=true → TLS implícito (465). false → STARTTLS (587, Gmail).
    secure: c.secure,
    auth: { user: c.user, pass: c.pass },
    ...TIMEOUTS,
  });
  return _transporter;
}

/** Solo para tests: fuerza a recrear el transporter con la config actual. */
function _reset() {
  _transporter = null;
}

const CODIGOS_RED = new Set([
  'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED', 'ECONNRESET',
  'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN',
]);

/**
 * Resume un error de Nodemailer sin datos sensibles: código, código SMTP,
 * comando y la primera línea de la respuesta del servidor (p. ej. "535-5.7.8
 * Username and Password not accepted"). Nodemailer no incluye la contraseña.
 */
function describirError(err) {
  const code = err?.code || 'EUNKNOWN';
  const categoria = code === 'EAUTH' || err?.responseCode === 535 || err?.responseCode === 534
    ? 'auth'
    : CODIGOS_RED.has(code) ? 'red' : 'envio';
  return {
    errorCode: code,
    categoria,
    responseCode: err?.responseCode,
    command: err?.command,
    detalle: typeof err?.response === 'string' ? primeraLinea(err.response) : primeraLinea(err?.message),
  };
}

async function send({ to, subject, html }, cfg) {
  try {
    const info = await getTransporter(cfg).sendMail({ from: cfg.smtp.from, to, subject, html });
    return { ok: true, messageId: info?.messageId };
  } catch (err) {
    return { ok: false, ...describirError(err) };
  }
}

/** Conexión + STARTTLS/TLS + autenticación, sin enviar ningún email. */
async function verify(cfg) {
  try {
    await getTransporter(cfg).verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, ...describirError(err) };
  }
}

function resumen(cfg) {
  const c = cfg.smtp;
  return {
    provider: 'smtp',
    host: c.host,
    port: c.port,
    secure: c.secure,
    user: redactarEmail(c.user),
    // El remitente suele ser la misma cuenta: se redacta la dirección.
    from: (c.from || '').replace(/[^\s<>"]+@[^\s<>"]+/, (dir) => redactarEmail(dir)),
  };
}

module.exports = { send, verify, resumen, describirError, _reset };
