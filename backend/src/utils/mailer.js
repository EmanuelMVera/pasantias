/**
 * mailer.js — Helper centralizado de envío de emails del sistema.
 *
 * Variables de entorno (ver config/env.js):
 *   EMAIL_HOST / EMAIL_PORT / EMAIL_SECURE — servidor SMTP (Gmail: smtp.gmail.com,
 *     587, secure=false → STARTTLS; o 465 con secure=true → TLS implícito)
 *   EMAIL_USER / EMAIL_PASS — credenciales (en Gmail: App Password, no la
 *     contraseña de la cuenta)
 *   EMAIL_FROM — remitente ("SisPasantías" <cuenta@dominio>)
 *
 * ── Contrato de enviarEmail ─────────────────────────────────────────────────
 *   enviarEmail(...) NUNCA lanza. Devuelve:
 *     { ok: true,  messageId }
 *     { ok: false, errorCode, categoria }   categoria: 'config' | 'auth' | 'red' | 'envio'
 *   y deja SIEMPRE un log (email_enviado / email_envio_fallo / email_dev_no_enviado)
 *   con el `tipo` del email y el requestId si se pasa `log` (req.log).
 *
 *   Así cada caller decide: los flujos críticos (aprobación con credenciales,
 *   recuperación desde Equipo) miran `ok` y lo informan; los avisos
 *   fire-and-forget simplemente no hacen `await`. Antes el helper se tragaba
 *   el error y los `.catch()` de los callers nunca se ejecutaban: un fallo de
 *   SMTP era invisible para todos.
 *
 * Nunca se loguea: la contraseña SMTP, el cuerpo del email (puede llevar
 * credenciales o links con token) ni el destinatario completo (se redacta).
 */

'use strict';

const nodemailer = require('nodemailer');
const logger = require('./logger');
const { config } = require('../config/env');

// Timeouts acotados: sin ellos nodemailer espera hasta 2 minutos una conexión
// que nunca llega (p. ej. si el proveedor bloquea el puerto SMTP saliente),
// y un request que hace `await` queda colgado.
const TIMEOUTS = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
};

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host:   config.email.host,
    port:   config.email.port,
    // EMAIL_SECURE=true → TLS implícito (puerto 465). Default false → STARTTLS
    // (puerto 587, Gmail).
    secure: config.email.secure,
    auth: {
      user: config.email.user,
      pass: config.email.pass,
    },
    ...TIMEOUTS,
  });
  return _transporter;
}

/** Solo para tests: fuerza a recrear el transporter con la config actual. */
function _resetTransporter() {
  _transporter = null;
}

/** "juan.perez@gmail.com" → "ju***@gmail.com" (para logs). */
function redactarEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return '[sin email]';
  const [local, dominio] = email.split('@');
  return `${local.slice(0, 2)}***@${dominio}`;
}

const CODIGOS_RED = new Set([
  'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED', 'ECONNRESET',
  'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN',
]);

/**
 * Resume un error de nodemailer sin datos sensibles: código, código de
 * respuesta SMTP, comando y la primera línea de la respuesta del servidor
 * (p. ej. "535-5.7.8 Username and Password not accepted"). Nunca incluye la
 * contraseña (nodemailer no la pone en el error) ni el cuerpo del mensaje.
 */
function describirErrorSmtp(err) {
  const code = err?.code || 'EUNKNOWN';
  const categoria = code === 'EAUTH' || err?.responseCode === 535 || err?.responseCode === 534
    ? 'auth'
    : CODIGOS_RED.has(code) ? 'red' : 'envio';
  const respuesta = typeof err?.response === 'string' ? err.response.split('\n')[0].slice(0, 200) : undefined;
  return {
    errorCode: code,
    categoria,
    responseCode: err?.responseCode,
    command: err?.command,
    detalle: respuesta || String(err?.message || '').split('\n')[0].slice(0, 200),
  };
}

/**
 * Envía un email. Nunca lanza (ver contrato arriba).
 *
 * @param {{ to: string|string[], subject: string, html: string, tipo?: string, log?: object }} opts
 *   - tipo: etiqueta para los logs ('recupero', 'aprobacion_empresa'…)
 *   - log:  logger del request (req.log) para que el log lleve el requestId
 * @returns {Promise<{ ok: true, messageId: string } | { ok: false, errorCode: string, categoria: string }>}
 */
async function enviarEmail({ to, subject, html, tipo = 'generico', log }) {
  const l = log || logger;
  const destinatarios = (Array.isArray(to) ? to : [to]).map(redactarEmail);

  if (!config.email.configured) {
    l.info({ tipo, destinatarios }, 'email_dev_no_enviado');
    return { ok: false, errorCode: 'EMAIL_NO_CONFIGURADO', categoria: 'config' };
  }

  try {
    const info = await getTransporter().sendMail({ from: config.email.from, to, subject, html });
    l.info({ tipo, destinatarios, messageId: info?.messageId }, 'email_enviado');
    return { ok: true, messageId: info?.messageId };
  } catch (err) {
    const desc = describirErrorSmtp(err);
    l.error({ tipo, destinatarios, smtp: desc }, 'email_envio_fallo');
    return { ok: false, errorCode: desc.errorCode, categoria: desc.categoria };
  }
}

/** Datos no sensibles de la config SMTP, para logs y el script de diagnóstico. */
function resumenConfigSmtp() {
  return {
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    user: redactarEmail(config.email.user),
    // El remitente suele ser la misma cuenta: se redacta la dirección.
    from: (config.email.from || '').replace(/[^\s<>"]+@[^\s<>"]+/, (dir) => redactarEmail(dir)),
  };
}

/**
 * Verifica conexión + autenticación SMTP (transporter.verify()) SIN enviar
 * ningún email. Nunca lanza.
 *
 * @returns {Promise<{ ok: true } | { ok: false, errorCode, categoria, responseCode?, command?, detalle }>}
 */
async function verificarSmtp() {
  if (!config.email.configured) {
    return { ok: false, errorCode: 'EMAIL_NO_CONFIGURADO', categoria: 'config', detalle: 'Faltan EMAIL_USER y/o EMAIL_PASS.' };
  }
  try {
    await getTransporter().verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, ...describirErrorSmtp(err) };
  }
}

/**
 * Diagnóstico SMTP al arrancar el servidor (server.js). Sin enviar emails.
 *
 * Política (decisión documentada en docs/DEPLOYMENT.md):
 *   - sin config: solo info (si EMAIL_REQUIRED=true en producción, validateEnv
 *     ya abortó antes);
 *   - verify OK → `email_smtp_verificado`;
 *   - AUTENTICACIÓN inválida (EAUTH / 535) y EMAIL_REQUIRED=true → LANZA: el
 *     arranque falla con un mensaje claro. Es un error definitivo de config
 *     (App Password mal cargada o revocada) que ningún reintento arregla, y
 *     Render mantiene el deploy anterior en vez de publicar uno sin correo;
 *   - red / timeout / otro → `email_smtp_verificacion_fallo` (nivel error,
 *     critico=true) y el servicio sigue: puede ser transitorio, y tumbar la
 *     API entera por eso haría más daño. Sin reintentos en bucle.
 *
 * @param {object} log  logger
 * @returns {Promise<{ ok: boolean, resultado?: object }>}
 */
async function verificarSmtpAlArrancar(log = logger) {
  if (!config.email.configured) {
    log.info('email_no_configurado: los emails se registran en el log en lugar de enviarse');
    return { ok: false };
  }
  const resultado = await verificarSmtp();
  const contexto = { smtp: resumenConfigSmtp() };
  if (resultado.ok) {
    log.info(contexto, 'email_smtp_verificado');
    return { ok: true };
  }
  const { ok: _ok, ...error } = resultado;
  log.error({ ...contexto, error, critico: true }, 'email_smtp_verificacion_fallo');
  if (resultado.categoria === 'auth' && config.email.required) {
    throw new Error(
      `SMTP rechazó la autenticación (${resultado.errorCode}${resultado.responseCode ? ` ${resultado.responseCode}` : ''}: `
      + `${resultado.detalle}). Revisá EMAIL_USER / EMAIL_PASS (en Gmail: una App Password vigente). `
      + 'EMAIL_REQUIRED=true impide arrancar sin correo.',
    );
  }
  return { ok: false, resultado };
}

/** Escapa texto que escribe un usuario antes de interpolarlo en el HTML. */
function escapeHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Genera el HTML base de una notificación. `titulo` y `mensaje` se escapan
 * (pueden contener nombres o motivos que escribió un usuario).
 *
 * @param {{ titulo: string, mensaje: string, enlace?: string }} opts
 */
function htmlNotificacion({ titulo, mensaje, enlace }) {
  const btnHtml = enlace
    ? `<div style="margin-top:24px;text-align:center;">
        <a href="${config.urls.client}${enlace}"
           style="background:#2563eb;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
          Ver en SisPasantías →
        </a>
       </div>`
    : '';

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0"
                 style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
            <!-- Header -->
            <tr>
              <td style="background:#1e3a5f;padding:24px 32px;">
                <p style="margin:0;color:#fff;font-size:1.1rem;font-weight:700;">SisPasantías</p>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:32px;">
                <h2 style="margin:0 0 12px;color:#1e293b;font-size:1.15rem;">${escapeHtml(titulo)}</h2>
                <p style="margin:0;color:#475569;line-height:1.6;">${escapeHtml(mensaje)}</p>
                ${btnHtml}
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;color:#94a3b8;font-size:0.78rem;text-align:center;">
                  Este es un mensaje automático del sistema SisPasantías. Por favor no respondas este correo.
                </p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;
}

module.exports = {
  enviarEmail,
  verificarSmtp,
  verificarSmtpAlArrancar,
  resumenConfigSmtp,
  describirErrorSmtp,
  redactarEmail,
  escapeHtml,
  htmlNotificacion,
  _resetTransporter,
};
