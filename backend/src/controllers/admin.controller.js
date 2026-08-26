'use strict';

/**
 * admin.controller.js — REF-ADMIN-01.
 *
 * Controllers finos del panel de administración: resuelven input, llaman al
 * service correspondiente, y dan forma a la respuesta. Extraído literal de
 * admin.routes.js, en subetapas — sin cambios de endpoint, respuesta,
 * permisos, auditoría, transacciones ni emails.
 */

const adminService = require('../services/admin.service');
const adminUsuariosService = require('../services/adminUsuarios.service');
const adminModeracionService = require('../services/adminModeracion.service');
const { SolicitudEmpresa, SolicitudReclutador, Empresa } = require('../models');
const solicitudEmpresaService = require('../services/solicitudEmpresa.service');
const solicitudReclutadorService = require('../services/solicitudReclutador.service');

// Mismo patrón que empresa.controller.js::_handleServiceError — traduce un
// HttpError del service a la respuesta exacta; cualquier otro error usa el
// mensaje 500 fijo que el endpoint ya devolvía antes del refactor.
function _handleServiceError(res, error, mensaje500) {
  if (error.statusCode) {
    const resp = { success: false, message: error.message };
    if (error.code) resp.code = error.code;
    return res.status(error.statusCode).json(resp);
  }
  console.error(mensaje500, error);
  return res.status(500).json({ success: false, message: mensaje500 });
}

// ── Dashboard / métricas ──────────────────────────────────────────────────────

exports.getDashboardGeneral = async (req, res) => {
  try {
    const data = await adminService.obtenerDashboardGeneral();
    return res.json({ success: true, data });
  } catch (err) {
    return _handleServiceError(res, err, 'Error al obtener el dashboard.');
  }
};

exports.getStats = async (req, res) => {
  try {
    const data = await adminService.obtenerStats();
    return res.json({ success: true, data });
  } catch (err) {
    return _handleServiceError(res, err, 'Error al obtener estadísticas.');
  }
};

exports.getActividadReciente = async (req, res) => {
  try {
    const data = await adminService.obtenerActividadReciente();
    return res.json({ success: true, data });
  } catch (err) {
    return _handleServiceError(res, err, 'Error al obtener actividad.');
  }
};

// ── Logs ───────────────────────────────────────────────────────────────────────

exports.getLogs = async (req, res) => {
  try {
    const { accion, usuarioId, entidad, desde, hasta, page, limit } = req.query;
    const resultado = await adminService.listarLogs({ accion, usuarioId, entidad, desde, hasta, page, limit });
    return res.json({ success: true, ...resultado });
  } catch (err) {
    return _handleServiceError(res, err, 'Error al obtener los logs.');
  }
};

exports.exportarLogs = async (req, res) => {
  try {
    const { accion, usuarioId, entidad, desde, hasta } = req.query;
    const csv = await adminService.exportarLogsCSV({ accion, usuarioId, entidad, desde, hasta });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="logs-${Date.now()}.csv"`);
    return res.send(String.fromCharCode(0xFEFF) + csv); // BOM para que Excel lo abra bien
  } catch (err) {
    return _handleServiceError(res, err, 'Error al exportar los logs.');
  }
};

// ── Usuarios ─────────────────────────────────────────────────────────────────

exports.getUsuarios = async (req, res) => {
  try {
    const { rol, activo, q } = req.query;
    const usuarios = await adminUsuariosService.listarUsuarios({ rol, activo, q });
    return res.json({ success: true, total: usuarios.length, data: usuarios });
  } catch (err) {
    return _handleServiceError(res, err, 'Error al listar usuarios.');
  }
};

exports.getUsuarioById = async (req, res) => {
  try {
    const usuario = await adminUsuariosService.obtenerUsuario(req.params.id);
    return res.json({ success: true, data: usuario });
  } catch (err) {
    return _handleServiceError(res, err, 'Error al obtener el usuario.');
  }
};

exports.crearUsuario = async (req, res) => {
  try {
    const { nombre, apellido, email, password, rol, telefono, ubicacion, legajo } = req.body;
    const data = await adminUsuariosService.crearUsuario(
      { nombre, apellido, email, password, rol, telefono, ubicacion, legajo },
      { actorUsuarioId: req.usuario.id, ip: req.ip }
    );
    return res.status(201).json({ success: true, message: 'Usuario creado.', data });
  } catch (err) {
    return _handleServiceError(res, err, 'Error al crear el usuario.');
  }
};

exports.actualizarUsuario = async (req, res) => {
  try {
    const data = await adminUsuariosService.actualizarUsuario(
      req.params.id, req.body, { actorUsuarioId: req.usuario.id, ip: req.ip }
    );
    return res.json({ success: true, message: 'Usuario actualizado.', data });
  } catch (err) {
    return _handleServiceError(res, err, 'Error al actualizar el usuario.');
  }
};

exports.eliminarUsuario = async (req, res) => {
  try {
    await adminUsuariosService.eliminarUsuario(req.params.id, { actorUsuarioId: req.usuario.id, ip: req.ip });
    return res.json({ success: true, message: 'Usuario desactivado (soft delete).' });
  } catch (err) {
    return _handleServiceError(res, err, 'Error al eliminar el usuario.');
  }
};

exports.toggleUsuario = async (req, res) => {
  try {
    const usuario = await adminUsuariosService.toggleUsuario(req.params.id, { actorUsuarioId: req.usuario.id, ip: req.ip });
    return res.json({ success: true, message: `Usuario ${usuario.activo ? 'activado' : 'desactivado'}.` });
  } catch (err) {
    return _handleServiceError(res, err, 'Error al cambiar estado del usuario.');
  }
};

// ── Empresas (aprobación directa) ───────────────────────────────────────────────
// Sin try/catch deliberadamente: admin.routes.js tampoco lo tenía para estos
// 3 endpoints — un error (incluido el HttpError 404 de "no encontrada") debe
// seguir propagando a error.middleware.js exactamente igual que antes.

exports.getEmpresasPendientes = async (req, res) => {
  const empresas = await adminModeracionService.listarEmpresasPendientes();
  return res.json({ success: true, data: empresas });
};

exports.aprobarEmpresa = async (req, res) => {
  await adminModeracionService.aprobarEmpresa(req.params.id, { actorUsuarioId: req.usuario.id, ip: req.ip });
  return res.json({ success: true, message: 'Empresa aprobada.' });
};

exports.rechazarEmpresa = async (req, res) => {
  await adminModeracionService.rechazarEmpresa(req.params.id, req.body?.motivo, { actorUsuarioId: req.usuario.id, ip: req.ip });
  return res.json({ success: true, message: 'Empresa rechazada.' });
};

// ── Moderación de ofertas ────────────────────────────────────────────────────────

exports.getOfertasPendientes = async (req, res) => {
  try {
    const ofertas = await adminModeracionService.listarOfertasPendientes();
    return res.json({ success: true, data: ofertas });
  } catch (err) {
    return _handleServiceError(res, err, 'Error al obtener ofertas pendientes.');
  }
};

exports.getOfertas = async (req, res) => {
  try {
    const { estado } = req.query;
    const ofertas = await adminModeracionService.listarOfertas({ estado });
    return res.json({ success: true, total: ofertas.length, data: ofertas });
  } catch (err) {
    return _handleServiceError(res, err, 'Error al obtener las ofertas.');
  }
};

exports.moderarOferta = async (req, res) => {
  try {
    const { accion, estado } = await adminModeracionService.moderarOferta(
      req.params.id, req.body, { actorUsuarioId: req.usuario.id, ip: req.ip }
    );
    const mensajeAccion = accion === 'aprobar' ? 'aprobada' : accion === 'pausar' ? 'pausada' : accion === 'rechazar' ? 'rechazada' : 'cerrada';
    return res.json({ success: true, message: `Oferta ${mensajeAccion}.`, data: { estado, moderada: true } });
  } catch (err) {
    return _handleServiceError(res, err, 'Error al moderar la oferta.');
  }
};

// ── Solicitudes de registro de empresa (v1.6) ─────────────────────────────────
// Las 2 rutas de listado son consultas directas (sin lógica de negocio, sin
// service dedicado hoy); aprobar/rechazar delegan 100% a solicitudEmpresaService
// (sin cambios en ese archivo — ver plan REF-ADMIN-01).

exports.getSolicitudesEmpresa = async (req, res) => {
  try {
    const { estado } = req.query;
    const where = {};
    if (estado) where.estado = estado;

    const solicitudes = await SolicitudEmpresa.findAll({ where, order: [['createdAt', 'DESC']] });
    return res.json({ success: true, total: solicitudes.length, data: solicitudes });
  } catch (err) {
    return _handleServiceError(res, err, 'Error al obtener las solicitudes.');
  }
};

exports.aprobarSolicitudEmpresa = async (req, res) => {
  try {
    const resultado = await solicitudEmpresaService.aprobarSolicitud(
      req.params.id,
      { adminUsuarioId: req.usuario.id, ip: req.ip }
    );
    return res.json({
      success: true,
      message: `Solicitud aprobada. Empresa "${resultado.razonSocial}" y usuario creados. Credenciales enviadas a ${resultado.email}.`,
      data: {
        empresaId:              resultado.empresaId,
        usuarioId:              resultado.usuarioId,
        email:                  resultado.email,
        reclutadoresPendientes: resultado.reclutadoresPendientes,
        ...(process.env.NODE_ENV !== 'production' && { passwordGenerada: resultado.passwordGenerada }),
      },
    });
  } catch (err) {
    return _handleServiceError(res, err, 'Error al aprobar la solicitud.');
  }
};

exports.rechazarSolicitudEmpresa = async (req, res) => {
  try {
    await solicitudEmpresaService.rechazarSolicitud(
      req.params.id,
      { adminUsuarioId: req.usuario.id, ip: req.ip },
      req.body.motivo
    );
    return res.json({ success: true, message: 'Solicitud rechazada. Notificación enviada por email.' });
  } catch (err) {
    return _handleServiceError(res, err, 'Error al rechazar la solicitud.');
  }
};

// ── Solicitudes de reclutadores (v1.7) ────────────────────────────────────────

exports.getSolicitudesReclutador = async (req, res) => {
  try {
    const { estado } = req.query;
    const where = {};
    if (estado) where.estado = estado;

    const solicitudes = await SolicitudReclutador.findAll({
      where,
      include: [{ model: Empresa, as: 'empresa', attributes: ['id', 'razonSocial', 'usuarioId'] }],
      order: [['createdAt', 'DESC']],
    });
    return res.json({ success: true, total: solicitudes.length, data: solicitudes });
  } catch (err) {
    return _handleServiceError(res, err, 'Error al obtener las solicitudes.');
  }
};

exports.aprobarSolicitudReclutador = async (req, res) => {
  try {
    const resultado = await solicitudReclutadorService.aprobarSolicitud(
      req.params.id,
      { adminUsuarioId: req.usuario.id, ip: req.ip }
    );
    return res.json({
      success: true,
      message: `Reclutador aprobado. Cuenta creada para ${resultado.email}.`,
      data: {
        usuarioId: resultado.usuarioId,
        email:     resultado.email,
        ...(process.env.NODE_ENV !== 'production' && { passwordGenerada: resultado.passwordGenerada }),
      },
    });
  } catch (err) {
    return _handleServiceError(res, err, 'Error al aprobar la solicitud.');
  }
};

exports.rechazarSolicitudReclutador = async (req, res) => {
  try {
    await solicitudReclutadorService.rechazarSolicitud(
      req.params.id,
      { adminUsuarioId: req.usuario.id, ip: req.ip },
      req.body.motivo
    );
    return res.json({ success: true, message: 'Solicitud rechazada. Notificación enviada a la empresa.' });
  } catch (err) {
    return _handleServiceError(res, err, 'Error al rechazar la solicitud.');
  }
};
