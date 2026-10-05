'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const {
  Usuario, Empresa, EmpresaUsuario, SolicitudReclutador,
  sequelize,
} = require('../models');
const HttpError = require('../utils/httpError');
const { enviarEmail, escapeHtml } = require('../utils/mailer');
const { config } = require('../config/env');
const { crearNotificacion } = require('../utils/notificador');
const { registrarAuditoria } = require('../utils/auditLog');
const { obtenerAdminsActivos } = require('./empresa.service');
const logger = require('../utils/logger');

/**
 * Crea la cuenta de reclutador a partir de una SolicitudReclutador pendiente:
 * valida que el email no tenga cuenta ya, y en una transacción crea el
 * Usuario, crea el EmpresaUsuario (rolInterno: reclutador) y marca la
 * solicitud como 'aprobado'. Reusado tanto por `aprobarSolicitud` (admin del
 * sistema aprueba manualmente) como por el alta automática de reclutador en
 * empresas de confianza (empresaEquipo.service.js — RBAC-05), que es
 * literalmente "el mismo mecanismo actual" aplicado sin esperar al admin.
 *
 * @returns {{ usuario: Usuario, passwordPlano: string }}
 */
async function crearCuentaReclutadorDesdeSolicitud(solicitud) {
  const t = await sequelize.transaction();
  try {
    const emailExistente = await Usuario.findOne({ where: { email: solicitud.email }, transaction: t });
    if (emailExistente) {
      await t.rollback();
      const err = new HttpError(400, `El email ${solicitud.email} ya tiene una cuenta registrada en el sistema. Verificá si el reclutador ya fue aprobado anteriormente.`);
      err.code = 'EMAIL_DUPLICADO';
      throw err;
    }

    const passwordPlano = crypto.randomBytes(6).toString('hex');
    const hash = await bcrypt.hash(passwordPlano, 12);

    const nuevoUsuario = await Usuario.create({
      nombre:   solicitud.nombre,
      apellido: solicitud.apellido?.trim() || 'S/D',
      email:    solicitud.email,
      password: hash,
      rol:      'empresa',
      activo:   true,
      habilitado: true,
    }, { transaction: t });

    await EmpresaUsuario.create({
      empresaId:  solicitud.empresaId,
      usuarioId:  nuevoUsuario.id,
      rolInterno: 'reclutador',
      activo:     true,
    }, { transaction: t });

    await solicitud.update({ estado: 'aprobado' }, { transaction: t });
    await t.commit();

    return { usuario: nuevoUsuario, passwordPlano };
  } catch (err) {
    // Solo hace rollback si la transacción no fue commiteada
    if (t.finished !== 'commit') await t.rollback();
    throw err;
  }
}

/**
 * Email al reclutador recién creado con sus credenciales de acceso —
 * mismo template tanto si lo disparó la aprobación manual del admin como
 * el alta automática por política de confianza.
 */
function enviarEmailCredencialesReclutador(solicitud, passwordPlano, { log, tipo = 'credenciales_reclutador' } = {}) {
  const loginUrl = `${config.urls.client}/login`;
  return enviarEmail({
    to: solicitud.email,
    tipo,
    log,
    subject: 'Tu cuenta de reclutador fue creada – SisPasantías',
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
      <h2 style="color:#0073AD">¡Tu cuenta fue creada!</h2>
      <p>Hola, <strong>${escapeHtml(solicitud.nombre)}</strong>.</p>
      <p>El equipo de <strong>SisPasantías</strong> activó tu cuenta de reclutador en <strong>${escapeHtml(solicitud.empresa?.razonSocial)}</strong>.</p>
      <table style="margin:1rem 0;border-collapse:collapse;width:100%">
        <tr><td style="padding:8px 12px;background:#f0f6fc;font-weight:600;width:130px">Email</td><td style="padding:8px 12px;background:#e8f4fb">${escapeHtml(solicitud.email)}</td></tr>
        <tr><td style="padding:8px 12px;background:#f0f6fc;font-weight:600">Contraseña</td><td style="padding:8px 12px;background:#e8f4fb;font-family:monospace;font-size:1.1rem">${passwordPlano}</td></tr>
      </table>
      <p style="color:#c0392b;font-size:0.88rem">Cambiá tu contraseña al ingresar por primera vez.</p>
      <a href="${loginUrl}" style="display:inline-block;margin-top:1rem;background:#0073AD;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">Ingresar al sistema</a>
    </div>`,
  });
}

/**
 * Aprueba una solicitud de reclutador:
 *  1. Valida estado
 *  2. Crea la cuenta (crearCuentaReclutadorDesdeSolicitud)
 *  3. Auditoría
 *  4. Notificación in-app al admin_empresa
 *  5. Email al reclutador con credenciales
 *  6. Email al propietario de la empresa
 *
 * @returns {{ usuarioId, email, passwordGenerada }}
 */
async function aprobarSolicitud(solicitudId, { adminUsuarioId, ip, requestId, log }) {
  const solicitud = await SolicitudReclutador.findByPk(solicitudId, {
    include: [{ model: Empresa, as: 'empresa', attributes: ['id', 'razonSocial'] }],
  });
  if (!solicitud) throw new HttpError(404, 'Solicitud no encontrada.');
  if (solicitud.estado !== 'pendiente') {
    throw new HttpError(400, `La solicitud ya fue ${solicitud.estado}.`);
  }

  const { usuario: nuevoUsuario, passwordPlano } = await crearCuentaReclutadorDesdeSolicitud(solicitud);

  await registrarAuditoria({
    usuarioId: adminUsuarioId,
    ip,
    requestId,
    accion:    'aprobar_solicitud_reclutador',
    entidad:   'solicitud_reclutador',
    entidadId: solicitud.id,
    detalle:   { email: solicitud.email, empresaId: solicitud.empresaId },
  });

  // Notificación in-app + email a todos los admin_empresa activos (RBAC-06)
  const admins = await obtenerAdminsActivos(solicitud.empresaId);
  await Promise.all(admins.map((admin) =>
    crearNotificacion({
      usuarioId: admin.id,
      titulo: '✅ Solicitud de reclutador aprobada',
      mensaje: `${solicitud.nombre}${solicitud.apellido ? ' ' + solicitud.apellido : ''} ya puede acceder al sistema como reclutador.`,
      tipo: 'sistema',
      tipoVisual: 'success',
      enlace: '/empresa/equipo',
      accionURL: '/empresa/equipo',
    }).catch((e) => logger.error({ err: e }, 'notif_aprobacion_reclutador_fallo'))
  ));

  // Email al reclutador con credenciales: se espera el resultado para
  // informarlo al admin. Si falla, la cuenta queda creada igual y el
  // reclutador entra con "Olvidé mi contraseña" (o su admin_empresa le manda
  // la recuperación desde Equipo).
  const envio = await enviarEmailCredencialesReclutador(solicitud, passwordPlano, { log });
  if (!envio.ok && envio.errorCode !== 'EMAIL_NO_CONFIGURADO') {
    (log || logger).error(
      { solicitudId: solicitud.id, usuarioId: nuevoUsuario.id, errorCode: envio.errorCode, categoria: envio.categoria },
      'aprobacion_reclutador_credenciales_no_enviadas',
    );
  }

  // Aviso a los admin_empresa activos (fire-and-forget: el mailer registra el resultado).
  admins.forEach((admin) => {
    enviarEmail({
      to: admin.email,
      tipo: 'aviso_reclutador_aprobado',
      log,
      subject: 'Solicitud de reclutador aprobada – SisPasantías',
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
        <h2 style="color:#0073AD">Solicitud aprobada</h2>
        <p>La solicitud de reclutador para <strong>${escapeHtml(solicitud.nombre)}</strong> (${escapeHtml(solicitud.email)}) fue <strong>aprobada</strong>.</p>
        <p>${envio.ok
          ? 'El reclutador ya puede acceder al sistema con las credenciales enviadas a su email.'
          : 'La cuenta está creada. Si el reclutador no recibió sus credenciales, enviale la recuperación de acceso desde Equipo.'}</p>
      </div>`,
    });
  });

  return {
    usuarioId: nuevoUsuario.id,
    email: solicitud.email,
    passwordGenerada: passwordPlano,
    emailCredencialesEnviado: envio.ok,
  };
}

/**
 * Rechaza una solicitud de reclutador, notifica in-app y por email al propietario.
 */
async function rechazarSolicitud(solicitudId, { adminUsuarioId, ip, requestId, log }, motivo) {
  const solicitud = await SolicitudReclutador.findByPk(solicitudId, {
    include: [{ model: Empresa, as: 'empresa', attributes: ['id', 'razonSocial'] }],
  });
  if (!solicitud) throw new HttpError(404, 'Solicitud no encontrada.');
  if (solicitud.estado !== 'pendiente') {
    throw new HttpError(400, `La solicitud ya fue ${solicitud.estado}.`);
  }

  await solicitud.update({ estado: 'rechazado', motivoRechazo: motivo || null });

  await registrarAuditoria({
    usuarioId: adminUsuarioId,
    ip,
    requestId,
    accion:    'rechazar_solicitud_reclutador',
    entidad:   'solicitud_reclutador',
    entidadId: solicitud.id,
    detalle:   { email: solicitud.email, motivo },
  });

  const admins = await obtenerAdminsActivos(solicitud.empresaId);

  await Promise.all(admins.map((admin) =>
    crearNotificacion({
      usuarioId: admin.id,
      titulo: '❌ Solicitud de reclutador rechazada',
      mensaje: `La solicitud para ${solicitud.nombre}${solicitud.apellido ? ' ' + solicitud.apellido : ''} (${solicitud.email}) no fue aprobada.${motivo ? ` Motivo: ${motivo}` : ''}`,
      tipo: 'sistema',
      tipoVisual: 'error',
      enlace: '/empresa/equipo',
      accionURL: '/empresa/equipo',
    }).catch((e) => logger.error({ err: e }, 'notif_rechazo_reclutador_fallo'))
  ));

  // Fire-and-forget: el mailer registra el resultado de cada envío.
  admins.forEach((admin) => {
    enviarEmail({
      to: admin.email,
      tipo: 'aviso_reclutador_rechazado',
      log,
      subject: 'Solicitud de reclutador rechazada – SisPasantías',
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
        <h2 style="color:#c0392b">Solicitud rechazada</h2>
        <p>La solicitud de reclutador para <strong>${escapeHtml(solicitud.nombre)}</strong> (${escapeHtml(solicitud.email)}) fue <strong>rechazada</strong>.</p>
        ${motivo ? `<p><strong>Motivo:</strong> ${escapeHtml(motivo)}</p>` : ''}
        <p>Si tenés consultas, contactate con el equipo del instituto.</p>
      </div>`,
    });
  });
}

module.exports = {
  aprobarSolicitud,
  rechazarSolicitud,
  crearCuentaReclutadorDesdeSolicitud,
  enviarEmailCredencialesReclutador,
};
