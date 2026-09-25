'use strict';

const { EmpresaUsuario, Usuario, SolicitudReclutador } = require('../models');
const HttpError = require('../utils/httpError');
const authService = require('./auth.service');
const solicitudReclutadorService = require('./solicitudReclutador.service');
const { crearNotificacion } = require('../utils/notificador');
const { registrarAuditoria } = require('../utils/auditLog');
const logger = require('../utils/logger');

async function listarEquipo(empresa) {
  const equipo = await EmpresaUsuario.findAll({
    where: { empresaId: empresa.id },
    include: [{
      model: Usuario,
      as: 'usuario',
      attributes: ['id', 'nombre', 'apellido', 'email', 'fotoPerfil', 'ultimoAcceso'],
    }],
    order: [
      ['rolInterno', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  });

  // RBAC-06: empresa_usuarios es la única fuente de verdad — toda empresa
  // tiene garantizada su fila admin_empresa real (migración 019), no hace
  // falta insertar ninguna fila virtual.
  return equipo.map((m) => m.toJSON());
}

/**
 * Dispara un email de recuperación de acceso para un miembro del equipo,
 * reutilizando el mismo mecanismo de token que el flujo público de
 * "olvidé mi contraseña" (auth.service.js). El admin_empresa NUNCA elige
 * ni conoce la contraseña — solo el reclutador la establece, siguiendo el
 * link del email hasta /reset-password/:token (EST-10).
 */
async function solicitarRecuperacionAcceso(empresa, miembroId) {
  const miembro = await EmpresaUsuario.findOne({
    where: { id: miembroId, empresaId: empresa.id },
    include: [{ model: Usuario, as: 'usuario' }],
  });

  if (!miembro) throw new HttpError(404, 'Miembro no encontrado.');

  if (miembro.rolInterno === 'admin_empresa') {
    throw new HttpError(403, 'No podés enviarte una recuperación de acceso a vos mismo desde el panel de equipo. Usá la opción "Olvidé mi contraseña" del login.');
  }

  const token = authService.generarTokenReset();
  const expira = new Date(Date.now() + 60 * 60 * 1000); // 1 hora, igual que el flujo público
  await miembro.usuario.update({
    tokenReset: authService.hashTokenReset(token),
    tokenResetExpira: expira,
    tokenResetUsadoEn: null,
  });

  await authService.enviarEmailReset(miembro.usuario.email, token);

  return { email: miembro.usuario.email, usuarioId: miembro.usuario.id };
}

async function actualizarMiembro(empresa, miembroId, { rolInterno, activo }) {
  const miembro = await EmpresaUsuario.findOne({
    where: { id: miembroId, empresaId: empresa.id },
  });
  if (!miembro) throw new HttpError(404, 'Miembro no encontrado.');

  if (miembro.rolInterno === 'admin_empresa') {
    throw new HttpError(403, 'No se puede modificar al administrador de empresa desde el panel de equipo.');
  }

  const updateData = {};

  if (rolInterno !== undefined) {
    if (rolInterno === 'admin_empresa') {
      throw new HttpError(400, 'No se puede asignar el rol admin_empresa a otro miembro.');
    }
    const rolesValidos = ['reclutador'];
    if (!rolesValidos.includes(rolInterno)) {
      throw new HttpError(400, `Rol inválido. Solo se puede asignar 'reclutador'.`);
    }
    updateData.rolInterno = rolInterno;
  }

  if (activo !== undefined) updateData.activo = activo;

  await miembro.update(updateData);
  return miembro;
}

async function desactivarMiembro(empresa, miembroId) {
  const miembro = await EmpresaUsuario.findOne({
    where: { id: miembroId, empresaId: empresa.id },
  });
  if (!miembro) throw new HttpError(404, 'Miembro no encontrado.');

  if (miembro.rolInterno === 'admin_empresa') {
    throw new HttpError(403, 'No se puede eliminar al administrador de empresa.');
  }

  await miembro.update({ activo: false });
}

/**
 * Notifica a los admins del sistema que una empresa de confianza agregó un
 * reclutador sin pasar por aprobación manual — moderación posterior, no
 * previa (RBAC-05). Mismo patrón fire-and-forget que
 * oferta.service.js::notificarAdminsNuevaOferta/notificarAdminsOfertaAutoAprobada.
 */
async function notificarAdminsReclutadorAutoAprobado(solicitud, empresa) {
  try {
    const admins = await Usuario.findAll({ where: { rol: 'admin', activo: true }, attributes: ['id'] });
    await Promise.all(admins.map((admin) =>
      crearNotificacion({
        usuarioId: admin.id,
        titulo: '🤝 Reclutador agregado automáticamente',
        mensaje: `La empresa de confianza "${empresa.razonSocial}" agregó a ${solicitud.nombre}${solicitud.apellido ? ' ' + solicitud.apellido : ''} como reclutador, sin aprobación manual.`,
        tipo: 'sistema',
        tipoVisual: 'info',
        enlace: '/admin/usuarios',
        accionURL: '/admin/usuarios',
      })
    ));
  } catch (e) { logger.error({ err: e }, 'notif_admin_reclutador_auto_aprobado_fallo'); }
}

async function solicitarReclutador(empresa, { nombre, apellido, email }, ctx = {}) {
  if (!nombre?.trim() || !apellido?.trim() || !email?.trim()) {
    throw new HttpError(400, 'Nombre, apellido y email son requeridos.');
  }

  const usuarioRegistrado = await Usuario.findOne({ where: { email: email.trim() } });
  if (usuarioRegistrado) {
    const esMiembro = await EmpresaUsuario.findOne({
      where: { empresaId: empresa.id, usuarioId: usuarioRegistrado.id, activo: true },
    });
    if (esMiembro) {
      const err = new HttpError(400, 'Ese email ya corresponde a un miembro activo del equipo.');
      err.code = 'YA_ES_MIEMBRO';
      throw err;
    }
    const err = new HttpError(400, 'Ese email ya tiene una cuenta registrada en el sistema. Contactate con el administrador si necesitás vincularlo a tu empresa.');
    err.code = 'EMAIL_REGISTRADO';
    throw err;
  }

  const solicitudPendiente = await SolicitudReclutador.findOne({
    where: { empresaId: empresa.id, email: email.trim().toLowerCase(), estado: 'pendiente' },
  });
  if (solicitudPendiente) {
    const err = new HttpError(400, 'Ya hay una solicitud pendiente para ese email en tu empresa.');
    err.code = 'EMAIL_SOLICITUD_PENDIENTE';
    throw err;
  }

  const solicitud = await SolicitudReclutador.create({
    empresaId: empresa.id,
    nombre:    nombre.trim(),
    apellido:  apellido.trim(),
    email:     email.trim().toLowerCase(),
    estado:    'pendiente',
  });

  // RBAC-05: empresa de confianza → alta inmediata, sin aprobación manual.
  // Reusa el mismo mecanismo de creación de cuenta que ya usa el admin del
  // sistema al aprobar una solicitud (solicitudReclutador.service.js) —
  // "según el mecanismo actual", solo que sin esperar al admin.
  if (empresa.nivelConfianza === 'confiable') {
    solicitud.empresa = empresa; // para el template del email (razonSocial)
    const { passwordPlano } = await solicitudReclutadorService.crearCuentaReclutadorDesdeSolicitud(solicitud);

    await registrarAuditoria({
      usuarioId: ctx.actorUsuarioId,
      ip: ctx.ip,
      requestId: ctx.requestId,
      accion:    'auto_aprobar_solicitud_reclutador',
      entidad:   'solicitud_reclutador',
      entidadId: solicitud.id,
      detalle:   { email: solicitud.email, empresaId: empresa.id, razonSocial: empresa.razonSocial },
    });

    solicitudReclutadorService.enviarEmailCredencialesReclutador(solicitud, passwordPlano)
      .catch((e) => logger.error({ err: e }, 'email_reclutador_auto_aprobado_fallo'));

    notificarAdminsReclutadorAutoAprobado(solicitud, empresa); // fire-and-forget
  }

  return solicitud;
}

async function obtenerSolicitudesReclutador(empresaId) {
  return SolicitudReclutador.findAll({
    where: { empresaId },
    order: [['createdAt', 'DESC']],
  });
}

module.exports = {
  listarEquipo,
  solicitarRecuperacionAcceso,
  actualizarMiembro,
  desactivarMiembro,
  solicitarReclutador,
  obtenerSolicitudesReclutador,
};
