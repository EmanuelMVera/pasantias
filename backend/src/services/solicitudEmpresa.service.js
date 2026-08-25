'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const {
  Usuario, Empresa, EmpresaUsuario, SolicitudEmpresa, SolicitudReclutador,
  ActivityLog, sequelize,
} = require('../models');
const HttpError = require('../utils/httpError');
const { enviarEmail } = require('../utils/mailer');

async function logAction(datos) {
  try { await ActivityLog.create(datos); } catch (e) { console.warn('[ActivityLog]', e.message); }
}

/**
 * Aprueba una solicitud de empresa:
 *  1. Pre-valida email de login
 *  2. En transacción: crea Usuario, Empresa, EmpresaUsuario y SolicitudReclutador por cada reclutador inicial
 *  3. Actualiza estado de la solicitud
 *  4. Envía email con credenciales (fire-and-forget)
 *
 * @returns {{ empresaId, usuarioId, email, razonSocial, reclutadoresPendientes, passwordGenerada }}
 */
async function aprobarSolicitud(solicitudId, { adminUsuarioId, ip }) {
  const solicitud = await SolicitudEmpresa.findByPk(solicitudId);
  if (!solicitud) throw new HttpError(404, 'Solicitud no encontrada.');
  if (solicitud.estado !== 'pendiente') {
    throw new HttpError(400, `La solicitud ya fue ${solicitud.estado}.`);
  }

  const loginEmail = solicitud.responsableEmail || solicitud.email;
  const emailExistente = await Usuario.findOne({ where: { email: loginEmail } });
  if (emailExistente) {
    const err = new HttpError(400, `Ya existe una cuenta registrada con el email ${loginEmail}. Usá otro email para el responsable o verificá si la empresa ya fue aprobada.`);
    err.code = 'EMAIL_DUPLICADO';
    throw err;
  }

  const passwordPlano = crypto.randomBytes(6).toString('hex');
  const hash = await bcrypt.hash(passwordPlano, 12);

  let nuevaEmpresa, nuevoUsuario, reclutadoresCreados;

  const t = await sequelize.transaction();
  try {
    nuevoUsuario = await Usuario.create({
      nombre:    solicitud.responsableNombre   || solicitud.razonSocial,
      apellido:  solicitud.responsableApellido || 'Empresa',
      email:     loginEmail,
      password:  hash,
      rol:       'empresa',
      telefono:  solicitud.responsableTelefono || solicitud.telefono || null,
      ubicacion: solicitud.ciudad || null,
      activo:    true,
      habilitado: true,
    }, { transaction: t });

    // empresas.cuit ahora es VARCHAR(11) con CHECK de solo dígitos (EST-08
    // §4.5). El formulario de solicitud no fuerza ese formato, así que se
    // normaliza acá; si no quedan exactamente 11 dígitos, se deja null en
    // vez de bloquear la aprobación — se completa a mano después.
    const cuitLimpio = (solicitud.cuit || '').replace(/\D/g, '');

    nuevaEmpresa = await Empresa.create({
      usuarioId:        nuevoUsuario.id,
      razonSocial:      solicitud.razonSocial,
      cuit:             cuitLimpio.length === 11 ? cuitLimpio : null,
      rubro:            solicitud.rubro,
      sitioWeb:         solicitud.sitioWeb    || null,
      direccion:        solicitud.direccion   || null,
      ciudad:           solicitud.ciudad      || null,
      telefono:         solicitud.telefono    || null,
      descripcion:      solicitud.descripcion || null,
      estadoAprobacion: 'aprobada',
      aprobadaPorUsuarioId: adminUsuarioId,
      aprobadaEn: new Date(),
    }, { transaction: t });

    await EmpresaUsuario.create({
      empresaId:  nuevaEmpresa.id,
      usuarioId:  nuevoUsuario.id,
      rolInterno: 'admin_empresa',
      activo:     true,
    }, { transaction: t });

    const reclutadoresSolicitud = Array.isArray(solicitud.reclutadores)
      ? solicitud.reclutadores.filter((r) => r?.nombre?.trim() && r?.email?.trim())
      : [];

    if (reclutadoresSolicitud.length > 0) {
      await SolicitudReclutador.bulkCreate(
        reclutadoresSolicitud.map((r) => ({
          empresaId: nuevaEmpresa.id,
          nombre:    r.nombre.trim(),
          apellido:  r.apellido?.trim() || null,
          email:     r.email.trim().toLowerCase(),
          estado:    'pendiente',
        })),
        { transaction: t }
      );
    }

    await solicitud.update({
      estado: 'aprobado',
      revisadaPorUsuarioId: adminUsuarioId,
      revisadaEn: new Date(),
      empresaIdCreada: nuevaEmpresa.id,
    }, { transaction: t });
    await t.commit();

    reclutadoresCreados = reclutadoresSolicitud.length;
  } catch (err) {
    await t.rollback();
    throw err;
  }

  await logAction({
    usuarioId: adminUsuarioId,
    accion:    'aprobar_solicitud_empresa',
    entidad:   'solicitud_empresa',
    entidadId: solicitud.id,
    detalle:   { razonSocial: solicitud.razonSocial, emailLogin: loginEmail, empresaId: nuevaEmpresa.id, reclutadoresCreados },
    ip,
  });

  // Email con credenciales — fire-and-forget
  const loginUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/login`;
  const nombreResponsable = solicitud.responsableNombre || solicitud.razonSocial;
  enviarEmail({
    to: loginEmail,
    subject: '✅ Tu solicitud fue aprobada – SisPasantías',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
        <h2 style="color:#0073AD">¡Tu solicitud fue aprobada! 🎉</h2>
        <p>Hola, <strong>${nombreResponsable}</strong>.</p>
        <p>El equipo de <strong>SisPasantías</strong> aprobó la solicitud de
        <strong>${solicitud.razonSocial}</strong>. Ya podés acceder al panel
        de empresa con las siguientes credenciales:</p>
        <table style="margin:1rem 0;border-collapse:collapse;width:100%">
          <tr>
            <td style="padding:8px 12px;background:#f0f6fc;font-weight:600;width:130px;border-radius:6px 0 0 6px">Email</td>
            <td style="padding:8px 12px;background:#e8f4fb;border-radius:0 6px 6px 0">${loginEmail}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f0f6fc;font-weight:600;margin-top:4px;border-radius:6px 0 0 6px">Contraseña</td>
            <td style="padding:8px 12px;background:#e8f4fb;border-radius:0 6px 6px 0;font-family:monospace;font-size:1.1rem;letter-spacing:0.05em">${passwordPlano}</td>
          </tr>
        </table>
        <p style="color:#c0392b;font-size:0.88rem">⚠️ Por seguridad, te recomendamos cambiar la contraseña al iniciar sesión por primera vez.</p>
        <a href="${loginUrl}" style="display:inline-block;margin-top:1rem;background:#0073AD;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">
          Ingresar al sistema
        </a>
        ${reclutadoresCreados > 0 ? `<p style="margin-top:1.5rem;font-size:0.88rem;color:#444">Se crearon ${reclutadoresCreados} solicitud(es) de reclutador pendientes de aprobación.</p>` : ''}
        <p style="margin-top:2rem;color:#888;font-size:0.82rem">SisPasantías – Portal Institucional de Empleo</p>
      </div>
    `,
  }).catch((e) => console.error('[Admin] Error enviando email de aprobación:', e.message));

  return {
    empresaId: nuevaEmpresa.id,
    usuarioId: nuevoUsuario.id,
    email: loginEmail,
    razonSocial: solicitud.razonSocial,
    reclutadoresPendientes: reclutadoresCreados,
    passwordGenerada: passwordPlano,
  };
}

/**
 * Rechaza una solicitud de empresa y notifica por email.
 */
async function rechazarSolicitud(solicitudId, { adminUsuarioId, ip }, motivo) {
  const solicitud = await SolicitudEmpresa.findByPk(solicitudId);
  if (!solicitud) throw new HttpError(404, 'Solicitud no encontrada.');
  if (solicitud.estado !== 'pendiente') {
    throw new HttpError(400, `La solicitud ya fue ${solicitud.estado}.`);
  }

  await solicitud.update({
    estado: 'rechazado',
    revisadaPorUsuarioId: adminUsuarioId,
    revisadaEn: new Date(),
    motivoRechazo: motivo || null,
  });

  await logAction({
    usuarioId: adminUsuarioId,
    accion:    'rechazar_solicitud_empresa',
    entidad:   'solicitud_empresa',
    entidadId: solicitud.id,
    detalle:   { razonSocial: solicitud.razonSocial, email: solicitud.email, motivo },
    ip,
  });

  enviarEmail({
    to: solicitud.email,
    subject: '❌ Tu solicitud no fue aprobada – SisPasantías',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
        <h2 style="color:#c0392b">Solicitud no aprobada</h2>
        <p>Hola, <strong>${solicitud.razonSocial}</strong>.</p>
        <p>Luego de revisar tu solicitud de registro en <strong>SisPasantías</strong>,
        lamentablemente no pudimos aprobarla en esta oportunidad.</p>
        ${motivo ? `<p><strong>Motivo:</strong> ${motivo}</p>` : ''}
        <p>Si considerás que fue un error o querés más información, podés comunicarte
        directamente con el equipo del instituto.</p>
        <p style="margin-top:2rem;color:#888;font-size:0.82rem">SisPasantías – Portal Institucional de Empleo</p>
      </div>
    `,
  }).catch((e) => console.error('[Admin] Error enviando email de rechazo:', e.message));
}

module.exports = { aprobarSolicitud, rechazarSolicitud };
