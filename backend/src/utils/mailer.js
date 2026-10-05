/**
 * mailer.js — FACHADA de envío de emails del sistema.
 *
 * Todos los flujos (recuperación, solicitudes de empresa, aprobaciones,
 * reclutadores, importación CSV, notificaciones) llaman a `enviarEmail()` y
 * no saben qué transporte hay detrás. El transporte lo elige EMAIL_PROVIDER:
 *
 *   brevo    → Brevo Transactional Email API por HTTPS (producción en Render:
 *              Render Free bloquea el SMTP saliente). BREVO_API_KEY,
 *              BREVO_SENDER_EMAIL, BREVO_SENDER_NAME.
 *   smtp     → Nodemailer (desarrollo local / hosting con SMTP). EMAIL_HOST,
 *              EMAIL_PORT, EMAIL_SECURE, EMAIL_USER, EMAIL_PASS, EMAIL_FROM.
 *   disabled → no se envía nada; se registra en el log (default si no se define).
 *
 * Proveedores: backend/src/services/email/providers/{brevo,smtp}.provider.js.
 *
 * ── Contrato de enviarEmail ─────────────────────────────────────────────────
 *   enviarEmail(...) NUNCA lanza. Devuelve:
 *     { ok: true,  messageId }
 *     { ok: false, errorCode, categoria }   categoria: 'config' | 'auth' | 'red' | 'envio'
 *   y deja SIEMPRE un log (email_enviado / email_envio_fallo / email_dev_no_enviado)
 *   con el proveedor, el `tipo` del email y el requestId si se pasa `log` (req.log).
 *
 *   Los flujos críticos (aprobación con credenciales, recuperación desde Equipo)
 *   miran `ok` y lo informan; los avisos fire-and-forget hacen `void enviarEmail(...)`.
 *   Nunca `.catch()`: no hay nada que atrapar.
 *
 * Nunca se loguea: API key, contraseña SMTP, el cuerpo del email (puede llevar
 * credenciales o links con token) ni el destinatario completo (se redacta).
 */

'use strict';

const logger = require('./logger');
const { config } = require('../config/env');
const { redactarEmail, normalizarDestinatarios } = require('../services/email/comun');

// Carga perezosa: con EMAIL_PROVIDER=brevo nunca se requiere Nodemailer.
const PROVEEDORES = {
  brevo: () => require('../services/email/providers/brevo.provider'),
  smtp: () => require('../services/email/providers/smtp.provider'),
};

/** Proveedor activo, o null si está deshabilitado o sin su configuración. */
function proveedorActivo() {
  const cargar = PROVEEDORES[config.email.provider];
  return cargar && config.email.configured ? cargar() : null;
}

const NO_CONFIGURADO = { ok: false, errorCode: 'EMAIL_NO_CONFIGURADO', categoria: 'config' };

/**
 * Envía un email por el proveedor configurado. Nunca lanza (ver contrato arriba).
 *
 * @param {{ to: string|string[], subject: string, html: string, tipo?: string, log?: object }} opts
 *   - tipo: etiqueta para los logs ('recupero_password', 'aprobacion_empresa_credenciales'…)
 *   - log:  logger del request (req.log) para que el log lleve el requestId
 * @returns {Promise<{ ok: true, messageId: string } | { ok: false, errorCode: string, categoria: string }>}
 */
async function enviarEmail({ to, subject, html, tipo = 'generico', log }) {
  const l = log || logger;
  const destinatarios = normalizarDestinatarios(to).map(redactarEmail);
  const proveedor = proveedorActivo();

  if (!proveedor) {
    l.info({ provider: config.email.provider, tipo, destinatarios }, 'email_dev_no_enviado');
    return NO_CONFIGURADO;
  }

  const r = await proveedor.send({ to, subject, html }, config.email);
  if (r.ok) {
    l.info({ provider: config.email.provider, tipo, destinatarios, messageId: r.messageId }, 'email_enviado');
    return { ok: true, messageId: r.messageId };
  }
  const { ok: _ok, ...error } = r;
  l.error({ provider: config.email.provider, tipo, destinatarios, error }, 'email_envio_fallo');
  return { ok: false, errorCode: r.errorCode, categoria: r.categoria };
}

/** Datos NO sensibles de la config de email (logs, email:verify). */
function resumenConfigEmail() {
  const proveedor = PROVEEDORES[config.email.provider];
  return proveedor
    ? { ...proveedor().resumen(config.email), configurado: config.email.configured }
    : { provider: config.email.provider, configurado: false };
}

/**
 * Verifica el proveedor SIN enviar ningún email:
 *   smtp  → transporter.verify() (conexión + TLS + autenticación);
 *   brevo → GET /v3/account (la API responde y la API key es válida).
 * Nunca lanza.
 */
async function verificarEmail() {
  if (!PROVEEDORES[config.email.provider]) {
    return { ...NO_CONFIGURADO, detalle: 'EMAIL_PROVIDER no definido o "disabled": no se envían emails.' };
  }
  if (!config.email.configured) {
    return {
      ...NO_CONFIGURADO,
      detalle: config.email.provider === 'brevo'
        ? 'Faltan BREVO_API_KEY y/o BREVO_SENDER_EMAIL.'
        : 'Faltan EMAIL_USER y/o EMAIL_PASS.',
    };
  }
  return proveedorActivo().verify(config.email);
}

/**
 * Diagnóstico del proveedor al arrancar el servidor (server.js). Sin enviar emails.
 *
 * Política (documentada en docs/DEPLOYMENT.md §4.1):
 *   - disabled: solo info (si EMAIL_REQUIRED=true en producción, validateEnv
 *     ya abortó antes);
 *   - falta la config del proveedor y EMAIL_REQUIRED=true → LANZA;
 *   - verificación OK → `email_provider_verificado` { provider };
 *   - credenciales inválidas (SMTP EAUTH/535, Brevo 401/403) y
 *     EMAIL_REQUIRED=true → LANZA: error definitivo de config que ningún
 *     reintento arregla (Render conserva el deploy anterior);
 *   - red / timeout / 5xx / otro → `email_provider_verificacion_fallo`
 *     (error, critico=true) y el servicio sigue: puede ser transitorio. Sin
 *     reintentos en bucle.
 *
 * @param {object} log  logger
 * @returns {Promise<{ ok: boolean, resultado?: object }>}
 */
async function verificarEmailAlArrancar(log = logger) {
  const provider = config.email.provider;
  if (!PROVEEDORES[provider]) {
    log.info({ provider }, 'email_deshabilitado: los emails se registran en el log en lugar de enviarse');
    return { ok: false };
  }
  const contexto = { email: resumenConfigEmail() };
  const resultado = await verificarEmail();
  if (resultado.ok) {
    log.info({ provider, ...contexto }, 'email_provider_verificado');
    return { ok: true };
  }
  const { ok: _ok, ...error } = resultado;
  log.error({ provider, ...contexto, error, critico: true }, 'email_provider_verificacion_fallo');
  const definitivo = resultado.categoria === 'auth' || resultado.categoria === 'config';
  if (definitivo && config.email.required) {
    throw new Error(
      `El proveedor de email (${provider}) no es utilizable: ${resultado.errorCode}`
      + `${resultado.detalle ? ` (${resultado.detalle})` : ''}. `
      + (provider === 'brevo'
        ? 'Revisá BREVO_API_KEY / BREVO_SENDER_EMAIL. '
        : 'Revisá EMAIL_USER / EMAIL_PASS (en Gmail: una App Password vigente). ')
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
  verificarEmail,
  verificarEmailAlArrancar,
  resumenConfigEmail,
  redactarEmail,
  escapeHtml,
  htmlNotificacion,
};
