/**
 * notificador.js — Wrapper que crea una notificación en BD Y envía email.
 *
 * Reemplaza los `await Notificacion.create(...)` dispersos en los controladores.
 * Nunca interrumpe el flujo principal: si el email falla, la notificación
 * en BD ya quedó creada igual.
 *
 * Uso:
 *   const { crearNotificacion } = require('../utils/notificador');
 *
 *   await crearNotificacion({
 *     usuarioId: 5,
 *     titulo: 'Nueva postulación',
 *     mensaje: 'Juan se postuló a tu oferta.',
 *     tipo: 'postulacion',
 *     enlace: '/empresa/postulaciones/3',
 *   });
 */

'use strict';

const { Notificacion, Usuario } = require('../models');
const { enviarEmail, htmlNotificacion } = require('./mailer');
const logger = require('./logger');

/**
 * Crea una notificación en la base de datos y envía un email al destinatario.
 *
 * `accionURL` es el campo canónico para el link accionable de la notificación.
 * `enlace` es legacy y se mantiene solo por compatibilidad de lectura; si un
 * emisor todavía solo completa `enlace`, se usa como fallback para poblar
 * `accionURL` automáticamente.
 *
 * @param {object} datos - Campos de Notificacion (usuarioId, titulo, mensaje, tipo, accionURL, enlace, ...)
 */
async function crearNotificacion(datos) {
  const payload = { ...datos, accionURL: datos.accionURL || datos.enlace || null };

  // 1. Crear la notificación en BD (siempre, independiente del email)
  const notif = await Notificacion.create(payload);

  // 2. Enviar email de forma asíncrona (fire-and-forget — no bloquea la respuesta)
  _enviarEmailNotificacion(payload).catch((err) =>
    logger.error({ err }, 'notificacion_email_fallo')
  );

  return notif;
}

/**
 * Busca el email del usuario y envía el correo de notificación.
 * @private
 */
async function _enviarEmailNotificacion({ usuarioId, titulo, mensaje, enlace }) {
  try {
    const usuario = await Usuario.findByPk(usuarioId, {
      attributes: ['email', 'nombre'],
    });
    if (!usuario?.email) return;

    await enviarEmail({
      to: usuario.email,
      subject: `🔔 ${titulo} — SisPasantías`,
      html: htmlNotificacion({ titulo, mensaje, enlace }),
    });
  } catch (err) {
    logger.error({ err }, 'notificacion_email_no_enviado');
  }
}

module.exports = { crearNotificacion };
