'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const {
  Usuario, Empresa, EmpresaUsuario, SolicitudReclutador,
  sequelize,
} = require('../models');
const HttpError = require('../utils/httpError');
const { enviarEmail } = require('../utils/mailer');
const { crearNotificacion } = require('../utils/notificador');
const { registrarAuditoria } = require('../utils/auditLog');
const logger = require('../utils/logger');

/**
 * Aprueba una solicitud de reclutador:
 *  1. Valida estado y duplicado de email
 *  2. En transacción: crea Usuario, crea EmpresaUsuario, actualiza solicitud
 *  3. Notificación in-app al admin_empresa
 *  4. Email al reclutador con credenciales
 *  5. Email al propietario de la empresa
 *
 * @returns {{ usuarioId, email, passwordGenerada }}
 */
async function aprobarSolicitud(solicitudId, { adminUsuarioId, ip, requestId }) {
  const t = await sequelize.transaction();
  try {
    const solicitud = await SolicitudReclutador.findByPk(solicitudId, {
      include: [{ model: Empresa, as: 'empresa', attributes: ['id', 'razonSocial', 'usuarioId'] }],
      transaction: t,
    });
    if (!solicitud) {
      await t.rollback();
      throw new HttpError(404, 'Solicitud no encontrada.');
    }
    if (solicitud.estado !== 'pendiente') {
      await t.rollback();
      throw new HttpError(400, `La solicitud ya fue ${solicitud.estado}.`);
    }

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

    await registrarAuditoria({
      usuarioId: adminUsuarioId,
      ip,
      requestId,
      accion:    'aprobar_solicitud_reclutador',
      entidad:   'solicitud_reclutador',
      entidadId: solicitud.id,
      detalle:   { email: solicitud.email, empresaId: solicitud.empresaId },
    });

    // Notificación in-app al admin_empresa
    const empresaOwner = solicitud.empresa?.usuarioId;
    if (empresaOwner) {
      crearNotificacion({
        usuarioId: empresaOwner,
        titulo: '✅ Solicitud de reclutador aprobada',
        mensaje: `${solicitud.nombre}${solicitud.apellido ? ' ' + solicitud.apellido : ''} ya puede acceder al sistema como reclutador.`,
        tipo: 'sistema',
        tipoVisual: 'success',
        enlace: '/empresa/equipo',
        accionURL: '/empresa/equipo',
      }).catch((e) => logger.error({ err: e }, 'notif_aprobacion_reclutador_fallo'));
    }

    const loginUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/login`;

    // Email al reclutador con credenciales
    enviarEmail({
      to: solicitud.email,
      subject: '✅ Tu cuenta de reclutador fue creada – SisPasantías',
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
        <h2 style="color:#0073AD">¡Tu cuenta fue creada! 🎉</h2>
        <p>Hola, <strong>${solicitud.nombre}</strong>.</p>
        <p>El equipo de <strong>SisPasantías</strong> activó tu cuenta de reclutador en <strong>${solicitud.empresa?.razonSocial}</strong>.</p>
        <table style="margin:1rem 0;border-collapse:collapse;width:100%">
          <tr><td style="padding:8px 12px;background:#f0f6fc;font-weight:600;width:130px">Email</td><td style="padding:8px 12px;background:#e8f4fb">${solicitud.email}</td></tr>
          <tr><td style="padding:8px 12px;background:#f0f6fc;font-weight:600">Contraseña</td><td style="padding:8px 12px;background:#e8f4fb;font-family:monospace;font-size:1.1rem">${passwordPlano}</td></tr>
        </table>
        <p style="color:#c0392b;font-size:0.88rem">⚠️ Cambiá tu contraseña al ingresar por primera vez.</p>
        <a href="${loginUrl}" style="display:inline-block;margin-top:1rem;background:#0073AD;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">Ingresar al sistema</a>
      </div>`,
    }).catch((e) => logger.error({ err: e }, 'email_reclutador_aprobado_fallo'));

    // Email al propietario de la empresa
    if (empresaOwner) {
      const propietario = await Usuario.findByPk(empresaOwner);
      if (propietario) {
        enviarEmail({
          to: propietario.email,
          subject: '✅ Solicitud de reclutador aprobada – SisPasantías',
          html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
            <h2 style="color:#0073AD">Solicitud aprobada</h2>
            <p>La solicitud de reclutador para <strong>${solicitud.nombre}</strong> (${solicitud.email}) fue <strong>aprobada</strong>.</p>
            <p>El reclutador ya puede acceder al sistema con las credenciales enviadas a su email.</p>
          </div>`,
        }).catch((e) => logger.error({ err: e }, 'email_empresa_aprobado_fallo'));
      }
    }

    return { usuarioId: nuevoUsuario.id, email: solicitud.email, passwordGenerada: passwordPlano };
  } catch (err) {
    // Solo hace rollback si la transacción no fue commiteada
    if (t.finished !== 'commit') await t.rollback();
    throw err;
  }
}

/**
 * Rechaza una solicitud de reclutador, notifica in-app y por email al propietario.
 */
async function rechazarSolicitud(solicitudId, { adminUsuarioId, ip, requestId }, motivo) {
  const solicitud = await SolicitudReclutador.findByPk(solicitudId, {
    include: [{ model: Empresa, as: 'empresa', attributes: ['id', 'razonSocial', 'usuarioId'] }],
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

  const empresaOwner = solicitud.empresa?.usuarioId;

  if (empresaOwner) {
    crearNotificacion({
      usuarioId: empresaOwner,
      titulo: '❌ Solicitud de reclutador rechazada',
      mensaje: `La solicitud para ${solicitud.nombre}${solicitud.apellido ? ' ' + solicitud.apellido : ''} (${solicitud.email}) no fue aprobada.${motivo ? ` Motivo: ${motivo}` : ''}`,
      tipo: 'sistema',
      tipoVisual: 'error',
      enlace: '/empresa/equipo',
      accionURL: '/empresa/equipo',
    }).catch((e) => logger.error({ err: e }, 'notif_rechazo_reclutador_fallo'));

    const propietario = await Usuario.findByPk(empresaOwner);
    if (propietario) {
      enviarEmail({
        to: propietario.email,
        subject: '❌ Solicitud de reclutador rechazada – SisPasantías',
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
          <h2 style="color:#c0392b">Solicitud rechazada</h2>
          <p>La solicitud de reclutador para <strong>${solicitud.nombre}</strong> (${solicitud.email}) fue <strong>rechazada</strong>.</p>
          ${motivo ? `<p><strong>Motivo:</strong> ${motivo}</p>` : ''}
          <p>Si tenés consultas, contactate con el equipo del instituto.</p>
        </div>`,
      }).catch((e) => logger.error({ err: e }, 'email_empresa_rechazado_fallo'));
    }
  }
}

module.exports = { aprobarSolicitud, rechazarSolicitud };
