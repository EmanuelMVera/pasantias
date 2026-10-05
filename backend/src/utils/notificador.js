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
 *
 * ── AUDITORÍA ≠ NOTIFICACIÓN ────────────────────────────────────────────────
 * AUDITORÍA (utils/auditLog.js → activity_logs): registro COMPLETO de acciones
 *   del sistema (logins, exports, ediciones, aprobaciones…). Es exhaustiva.
 * NOTIFICACIÓN (este archivo): aviso dirigido a un usuario porque ocurrió algo
 *   que debe conocer o revisar (algo nuevo pendiente, un cambio que lo afecta).
 * No se notifica cada ActivityLog: nada de logins, exportaciones, ediciones ni
 * acciones que el propio destinatario acaba de hacer. Ver backend/README.md §8b.
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
  // (_enviarEmailNotificacion nunca lanza: atrapa sus propios errores de BD y
  // enviarEmail no lanza por contrato.)
  void _enviarEmailNotificacion(payload);

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

/**
 * Notifica a TODOS los administradores del sistema activos (rol admin,
 * activo y habilitado). Pensado para cosas nuevas que requieren su atención
 * (p. ej. una solicitud pendiente de revisión), no para eventos rutinarios.
 *
 * Nunca lanza: se usa fire-and-forget desde el flujo principal, y un fallo
 * al notificar no debe impedir la operación que lo originó.
 *
 * @param {object} datos
 * @param {string} datos.titulo
 * @param {string} datos.mensaje
 * @param {string} datos.accionURL  ruta interna donde se resuelve el aviso
 * @param {string} [datos.tipo='sistema']
 * @param {string} [datos.tipoVisual='info']
 * @param {string} [datos.logKey='notif_admins_fallo']  clave del log si falla
 * @returns {Promise<number>} cantidad de notificaciones creadas
 */
async function notificarAdminsSistema({
  titulo, mensaje, accionURL, tipo = 'sistema', tipoVisual = 'info', logKey = 'notif_admins_fallo',
}) {
  try {
    const admins = await Usuario.findAll({
      where: { rol: 'admin', activo: true, habilitado: true },
      attributes: ['id'],
    });
    const resultados = await Promise.allSettled(admins.map((admin) =>
      crearNotificacion({
        usuarioId: admin.id, titulo, mensaje, tipo, tipoVisual,
        enlace: accionURL, accionURL,
      })
    ));
    const fallidas = resultados.filter((r) => r.status === 'rejected');
    if (fallidas.length) logger.error({ err: fallidas[0].reason, fallidas: fallidas.length }, logKey);
    return resultados.length - fallidas.length;
  } catch (err) {
    logger.error({ err }, logKey);
    return 0;
  }
}

module.exports = { crearNotificacion, notificarAdminsSistema };
