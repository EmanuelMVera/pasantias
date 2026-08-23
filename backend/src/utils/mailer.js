/**
 * mailer.js — Helper centralizado de envío de emails del sistema.
 *
 * Usa las variables de entorno:
 *   EMAIL_USER  — cuenta SMTP (ej. noreply@sispasantias.com)
 *   EMAIL_PASS  — contraseña / app password
 *   EMAIL_HOST  — servidor SMTP (ej. smtp.gmail.com)
 *   EMAIL_PORT  — puerto SMTP (ej. 587)
 *
 * Si EMAIL_USER/EMAIL_PASS no están configuradas, imprime en consola (modo DEV).
 *
 * Uso:
 *   const { enviarEmail } = require('../utils/mailer');
 *   await enviarEmail({ to, subject, html });
 */

'use strict';

const nodemailer = require('nodemailer');

// Transporter reutilizable (lazy init)
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST  || 'smtp.gmail.com',
    port:   Number(process.env.EMAIL_PORT || 587),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  return _transporter;
}

/**
 * Envía un email. Nunca lanza error — falla silenciosamente con log.
 *
 * @param {{ to: string, subject: string, html: string }} opts
 */
async function enviarEmail({ to, subject, html }) {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log(`[Mailer DEV] Para: ${to} | Asunto: ${subject}`);
      return;
    }
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"SisPasantías" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error(`[Mailer] Error al enviar email a ${to}:`, err.message);
  }
}

/**
 * Genera el HTML base de una notificación.
 *
 * @param {{ titulo: string, mensaje: string, enlace?: string }} opts
 */
function htmlNotificacion({ titulo, mensaje, enlace }) {
  const btnHtml = enlace
    ? `<div style="margin-top:24px;text-align:center;">
        <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}${enlace}"
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
                <p style="margin:0;color:#fff;font-size:1.1rem;font-weight:700;">🎓 SisPasantías</p>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:32px;">
                <h2 style="margin:0 0 12px;color:#1e293b;font-size:1.15rem;">${titulo}</h2>
                <p style="margin:0;color:#475569;line-height:1.6;">${mensaje}</p>
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

module.exports = { enviarEmail, htmlNotificacion };
