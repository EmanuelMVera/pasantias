'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const {
  Usuario, Empresa, EmpresaUsuario, SolicitudEmpresa, SolicitudReclutador,
  sequelize,
} = require('../models');
const HttpError = require('../utils/httpError');
const { Op } = require('sequelize');
const { normalizarTelefonoAR } = require('../validators/common.validator');
const { enviarEmail, escapeHtml } = require('../utils/mailer');
const { config } = require('../config/env');
const { registrarAuditoria } = require('../utils/auditLog');
const logger = require('../utils/logger');

/**
 * ¿Se puede presentar una solicitud nueva con este CUIT? (canónico: 11 dígitos)
 *   - Empresa existente (no eliminada) con ese CUIT → 409 CUIT_EMPRESA_EXISTENTE
 *     (incluye las creadas por una solicitud ya aprobada).
 *   - Solicitud PENDIENTE con ese CUIT → 409 CUIT_SOLICITUD_PENDIENTE.
 *   - Solicitudes RECHAZADAS → no bloquean: la empresa puede corregir sus datos
 *     y volver a presentarse.
 * La comparación con las solicitudes se hace por DÍGITOS en la base
 * (regexp_replace): las filas legacy pueden tener el CUIT con guiones, y
 * "30-99999997-9" y "30999999979" son el mismo CUIT.
 * Sin UNIQUE en solicitud_empresas.cuit: impediría los reintentos tras un rechazo.
 */
async function verificarCuitDisponible(cuit) {
  const empresa = await Empresa.findOne({ where: { cuit }, attributes: ['id'] });
  if (empresa) {
    const err = new HttpError(409, 'Ya hay una empresa registrada con este CUIT. Si formás parte de ella, pedile acceso a su administrador o contactá al instituto.');
    err.code = 'CUIT_EMPRESA_EXISTENTE';
    throw err;
  }
  const pendiente = await SolicitudEmpresa.findOne({
    where: {
      estado: 'pendiente',
      [Op.and]: [sequelize.where(sequelize.fn('regexp_replace', sequelize.col('cuit'), '[^0-9]', '', 'g'), cuit)],
    },
    attributes: ['id'],
  });
  if (pendiente) {
    const err = new HttpError(409, 'Ya existe una solicitud pendiente para este CUIT.');
    err.code = 'CUIT_SOLICITUD_PENDIENTE';
    throw err;
  }
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
async function aprobarSolicitud(solicitudId, { adminUsuarioId, ip, requestId, log }) {
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
      // Solicitudes nuevas ya traen el teléfono canónico; las legacy se
      // normalizan si se puede (si no, se conserva el valor original).
      telefono:  telefonoCanonico(solicitud.responsableTelefono || solicitud.telefono),
      ubicacion: solicitud.ciudad || null,
      activo:    true,
      habilitado: true,
    }, { transaction: t });

    // empresas.cuit es VARCHAR(11) con CHECK de solo dígitos (EST-08 §4.5).
    // Las solicitudes nuevas ya guardan el CUIT canónico (validador); esto
    // cubre las LEGACY con guiones. Si no quedan 11 dígitos, null en vez de
    // bloquear la aprobación (se completa a mano después).
    const cuitLimpio = (solicitud.cuit || '').replace(/\D/g, '');

    nuevaEmpresa = await Empresa.create({
      razonSocial:      solicitud.razonSocial,
      cuit:             cuitLimpio.length === 11 ? cuitLimpio : null,
      rubro:            solicitud.rubro,
      sitioWeb:         solicitud.sitioWeb    || null,
      direccion:        solicitud.direccion   || null,
      ciudad:           solicitud.ciudad      || null,
      telefono:         telefonoCanonico(solicitud.telefono),
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

  await registrarAuditoria({
    usuarioId: adminUsuarioId,
    ip,
    requestId,
    accion:    'aprobar_solicitud_empresa',
    entidad:   'solicitud_empresa',
    entidadId: solicitud.id,
    detalle:   { razonSocial: solicitud.razonSocial, emailLogin: loginEmail, empresaId: nuevaEmpresa.id, reclutadoresCreados },
  });

  // Email con credenciales. Se ESPERA el resultado (con timeouts acotados en el
  // mailer) para informarlo al admin: si falla, la empresa queda aprobada igual
  // — no se revierte por una caída de Gmail — y el responsable puede entrar con
  // "Olvidé mi contraseña" en cuanto el correo funcione.
  const loginUrl = `${config.urls.client}/login`;
  const nombreResponsable = solicitud.responsableNombre || solicitud.razonSocial;
  const envio = await enviarEmail({
    to: loginEmail,
    tipo: 'aprobacion_empresa_credenciales',
    log,
    subject: 'Tu solicitud fue aprobada – SisPasantías',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
        <h2 style="color:#0073AD">¡Tu solicitud fue aprobada!</h2>
        <p>Hola, <strong>${escapeHtml(nombreResponsable)}</strong>.</p>
        <p>El equipo de <strong>SisPasantías</strong> aprobó la solicitud de
        <strong>${escapeHtml(solicitud.razonSocial)}</strong>. Ya podés acceder al panel
        de empresa con las siguientes credenciales:</p>
        <table style="margin:1rem 0;border-collapse:collapse;width:100%">
          <tr>
            <td style="padding:8px 12px;background:#f0f6fc;font-weight:600;width:130px;border-radius:6px 0 0 6px">Email</td>
            <td style="padding:8px 12px;background:#e8f4fb;border-radius:0 6px 6px 0">${escapeHtml(loginEmail)}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f0f6fc;font-weight:600;margin-top:4px;border-radius:6px 0 0 6px">Contraseña</td>
            <td style="padding:8px 12px;background:#e8f4fb;border-radius:0 6px 6px 0;font-family:monospace;font-size:1.1rem;letter-spacing:0.05em">${passwordPlano}</td>
          </tr>
        </table>
        <p style="color:#c0392b;font-size:0.88rem">Por seguridad, te recomendamos cambiar la contraseña al iniciar sesión por primera vez.</p>
        <a href="${loginUrl}" style="display:inline-block;margin-top:1rem;background:#0073AD;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">
          Ingresar al sistema
        </a>
        ${reclutadoresCreados > 0 ? `<p style="margin-top:1.5rem;font-size:0.88rem;color:#444">Se crearon ${reclutadoresCreados} solicitud(es) de reclutador pendientes de aprobación.</p>` : ''}
        <p style="margin-top:2rem;color:#888;font-size:0.82rem">SisPasantías – Portal Institucional de Empleo</p>
      </div>
    `,
  });

  if (!envio.ok && envio.errorCode !== 'EMAIL_NO_CONFIGURADO') {
    (log || logger).error(
      { solicitudId: solicitud.id, empresaId: nuevaEmpresa.id, errorCode: envio.errorCode, categoria: envio.categoria },
      'aprobacion_empresa_credenciales_no_enviadas',
    );
  }

  return {
    empresaId: nuevaEmpresa.id,
    usuarioId: nuevoUsuario.id,
    email: loginEmail,
    razonSocial: solicitud.razonSocial,
    reclutadoresPendientes: reclutadoresCreados,
    passwordGenerada: passwordPlano,
    emailCredencialesEnviado: envio.ok,
  };
}

/**
 * Email de recepción al crear una solicitud (al responsable, con copia al
 * contacto institucional si es otro). Sin credenciales: la cuenta recién se
 * crea al aprobarla. Nunca lanza; devuelve el resultado de enviarEmail.
 */
function enviarConfirmacionSolicitud(solicitud, { log } = {}) {
  const destinatarios = [...new Set([solicitud.responsableEmail, solicitud.email].filter(Boolean))];
  const nombre = solicitud.responsableNombre || solicitud.razonSocial;
  return enviarEmail({
    to: destinatarios,
    tipo: 'solicitud_empresa_recibida',
    log,
    subject: 'Recibimos tu solicitud – SisPasantías',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
        <h2 style="color:#0073AD">Recibimos tu solicitud</h2>
        <p>Hola, <strong>${escapeHtml(nombre)}</strong>.</p>
        <p>Recibimos la solicitud de registro de <strong>${escapeHtml(solicitud.razonSocial)}</strong>
        en SisPasantías.</p>
        <p>Está pendiente de revisión por el instituto. Te vamos a avisar por este medio
        cuando haya una decisión; si se aprueba, en ese momento vas a recibir los datos
        de acceso.</p>
        <p style="margin-top:2rem;color:#888;font-size:0.82rem">SisPasantías – Portal Institucional de Empleo</p>
      </div>
    `,
  });
}

/**
 * Rechaza una solicitud de empresa y notifica por email.
 */
async function rechazarSolicitud(solicitudId, { adminUsuarioId, ip, requestId, log }, motivo) {
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

  await registrarAuditoria({
    usuarioId: adminUsuarioId,
    ip,
    requestId,
    accion:    'rechazar_solicitud_empresa',
    entidad:   'solicitud_empresa',
    entidadId: solicitud.id,
    detalle:   { razonSocial: solicitud.razonSocial, email: solicitud.email, motivo },
  });

  // Fire-and-forget: el resultado (éxito o fallo) lo registra el mailer.
  // Va al responsable y al contacto institucional (antes solo al segundo).
  void enviarEmail({
    to: [...new Set([solicitud.responsableEmail, solicitud.email].filter(Boolean))],
    tipo: 'rechazo_solicitud_empresa',
    log,
    subject: 'Tu solicitud no fue aprobada – SisPasantías',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
        <h2 style="color:#c0392b">Solicitud no aprobada</h2>
        <p>Hola, <strong>${escapeHtml(solicitud.razonSocial)}</strong>.</p>
        <p>Luego de revisar tu solicitud de registro en <strong>SisPasantías</strong>,
        lamentablemente no pudimos aprobarla en esta oportunidad.</p>
        ${motivo ? `<p><strong>Motivo:</strong> ${escapeHtml(motivo)}</p>` : ''}
        <p>Si considerás que fue un error o querés más información, podés comunicarte
        directamente con el equipo del instituto.</p>
        <p style="margin-top:2rem;color:#888;font-size:0.82rem">SisPasantías – Portal Institucional de Empleo</p>
      </div>
    `,
  });
}

/** Canónico si el valor (posiblemente legacy) se puede normalizar; si no, el original. */
function telefonoCanonico(valor) {
  if (!valor) return null;
  return normalizarTelefonoAR(valor) ?? valor;
}

module.exports = {
  aprobarSolicitud, rechazarSolicitud, enviarConfirmacionSolicitud, verificarCuitDisponible,
};
