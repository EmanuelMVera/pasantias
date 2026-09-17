'use strict';

/**
 * admin.controller.js — REF-ADMIN-01 / REF-ERR-01.
 *
 * Controllers finos del panel de administración: resuelven input, llaman al
 * service correspondiente, y dan forma a la respuesta. Los errores esperables
 * se lanzan como HttpError desde los services; error.middleware.js (montado
 * detrás de asyncHandler en cada ruta) los traduce a la respuesta exacta —
 * ya no hace falta un helper local por controller.
 */

const adminService = require('../services/admin.service');
const adminEstadisticasService = require('../services/adminEstadisticas.service');
const exportService = require('../services/export.service');
const adminUsuariosService = require('../services/adminUsuarios.service');
const adminModeracionService = require('../services/adminModeracion.service');
const { SolicitudEmpresa, SolicitudReclutador, Empresa } = require('../models');
const solicitudEmpresaService = require('../services/solicitudEmpresa.service');
const solicitudReclutadorService = require('../services/solicitudReclutador.service');
const csvImportacionService = require('../services/csvImportacion.service');
const HttpError = require('../utils/httpError');
const { registrarAuditoria } = require('../utils/auditLog');
const { parsePagination, buildPagination, groupCount } = require('../utils/pagination');

const FORMATOS_EXPORT_LOGS = ['csv', 'xlsx', 'pdf'];
const FORMATOS_EXPORT_ESTADISTICAS = ['xlsx', 'pdf'];

function nombreActor(req) {
  return `${req.usuario.nombre} ${req.usuario.apellido} (${req.usuario.email})`;
}

const MIME_POR_FORMATO = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

function enviarArchivo(res, { buffer, filename }, mime) {
  res.setHeader('Content-Type', mime);
  // Nombre generado 100% server-side (ver export.service.nombreArchivo) —
  // nunca a partir de input del cliente, así el header queda siempre seguro.
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(buffer);
}

// ── Dashboard / métricas ──────────────────────────────────────────────────────

exports.getDashboardGeneral = async (req, res) => {
  const data = await adminService.obtenerDashboardGeneral();
  return res.json({ success: true, data });
};

exports.getStats = async (req, res) => {
  const data = await adminService.obtenerStats();
  return res.json({ success: true, data });
};

exports.getActividadReciente = async (req, res) => {
  const data = await adminService.obtenerActividadReciente();
  return res.json({ success: true, data });
};

// ── Logs ───────────────────────────────────────────────────────────────────────

exports.getLogs = async (req, res) => {
  const { accion, usuarioId, entidad, desde, hasta } = req.query;
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 25, maxLimit: 100 });
  const { data, pagination } = await adminService.listarLogs({
    accion, usuarioId, entidad, desde, hasta, page, limit, offset,
  });
  return res.json({ success: true, data, pagination, total: pagination.total });
};

exports.exportarLogs = async (req, res) => {
  const { accion, usuarioId, entidad, desde, hasta } = req.query;
  const filtros = { accion, usuarioId, entidad, desde, hasta };
  const format = (req.query.format || 'csv').toLowerCase();

  if (!FORMATOS_EXPORT_LOGS.includes(format)) {
    throw new HttpError(400, `Formato inválido. Valores permitidos: ${FORMATOS_EXPORT_LOGS.join(', ')}.`);
  }

  let filas;
  if (format === 'csv') {
    const csv = await adminService.exportarLogsCSV(filtros);
    filas = null; // el conteo exacto no importa acá — el CSV ya es el formato "legacy"
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="logs-${Date.now()}.csv"`);
    res.send(String.fromCharCode(0xFEFF) + csv); // BOM para que Excel lo abra bien
  } else {
    const generar = format === 'xlsx' ? exportService.generarLogsExcel : exportService.generarLogsPDF;
    const resultado = await generar(filtros, { generadoPor: nombreActor(req) });
    filas = resultado.filas;
    enviarArchivo(res, resultado, MIME_POR_FORMATO[format]);
  }

  // Auditoría de la exportación — nunca el contenido exportado, solo qué se
  // pidió y cuántas filas salieron. La respuesta ya se envió arriba; esto
  // solo termina de resolver el handler (await, no fire-and-forget, para que
  // el log quede escrito de forma confiable antes de que el request termine).
  await registrarAuditoria({
    req, accion: 'exportar_logs', entidad: 'activity_log',
    detalle: { formato: format, filtros, filas },
  });
};

// ── Estadísticas ───────────────────────────────────────────────────────────────

exports.getEstadisticasGenerales = async (req, res) => {
  const { desde, hasta, periodoDias } = req.query;
  const data = await adminEstadisticasService.obtenerEstadisticasGenerales({ desde, hasta, periodoDias });
  return res.json({ success: true, data });
};

exports.exportarEstadisticas = async (req, res) => {
  const { desde, hasta, periodoDias } = req.query;
  const filtros = { desde, hasta, periodoDias };
  const format = (req.query.format || 'xlsx').toLowerCase();

  if (!FORMATOS_EXPORT_ESTADISTICAS.includes(format)) {
    throw new HttpError(400, `Formato inválido. Valores permitidos: ${FORMATOS_EXPORT_ESTADISTICAS.join(', ')}.`);
  }

  const generar = format === 'xlsx' ? exportService.generarEstadisticasExcel : exportService.generarEstadisticasPDF;
  const resultado = await generar(filtros, { generadoPor: nombreActor(req) });
  enviarArchivo(res, resultado, MIME_POR_FORMATO[format]);

  await registrarAuditoria({
    req, accion: 'exportar_estadisticas', entidad: 'estadisticas',
    detalle: { formato: format, filtros },
  });
};

// ── Usuarios ─────────────────────────────────────────────────────────────────

exports.getUsuarios = async (req, res) => {
  const { rol, activo, q } = req.query;
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 25, maxLimit: 100 });
  const { data, pagination } = await adminUsuariosService.listarUsuarios({ rol, activo, q, page, limit, offset });
  return res.json({ success: true, data, pagination, total: pagination.total });
};

exports.getUsuarioById = async (req, res) => {
  const usuario = await adminUsuariosService.obtenerUsuario(req.params.id);
  return res.json({ success: true, data: usuario });
};

exports.crearUsuario = async (req, res) => {
  const { nombre, apellido, email, password, rol, telefono, ubicacion, legajo } = req.body;
  const data = await adminUsuariosService.crearUsuario(
    { nombre, apellido, email, password, rol, telefono, ubicacion, legajo },
    { actorUsuarioId: req.usuario.id, ip: req.ip, requestId: req.id }
  );
  return res.status(201).json({ success: true, message: 'Usuario creado.', data });
};

exports.actualizarUsuario = async (req, res) => {
  const data = await adminUsuariosService.actualizarUsuario(
    req.params.id, req.body, { actorUsuarioId: req.usuario.id, ip: req.ip, requestId: req.id }
  );
  return res.json({ success: true, message: 'Usuario actualizado.', data });
};

exports.eliminarUsuario = async (req, res) => {
  await adminUsuariosService.eliminarUsuario(req.params.id, { actorUsuarioId: req.usuario.id, ip: req.ip, requestId: req.id });
  return res.json({ success: true, message: 'Usuario desactivado (soft delete).' });
};

exports.toggleUsuario = async (req, res) => {
  const usuario = await adminUsuariosService.toggleUsuario(req.params.id, { actorUsuarioId: req.usuario.id, ip: req.ip, requestId: req.id });
  return res.json({ success: true, message: `Usuario ${usuario.activo ? 'activado' : 'desactivado'}.` });
};

// ── Empresas (aprobación directa) ───────────────────────────────────────────────

exports.getEmpresasPendientes = async (req, res) => {
  const empresas = await adminModeracionService.listarEmpresasPendientes();
  return res.json({ success: true, data: empresas });
};

exports.aprobarEmpresa = async (req, res) => {
  await adminModeracionService.aprobarEmpresa(req.params.id, { actorUsuarioId: req.usuario.id, ip: req.ip, requestId: req.id });
  return res.json({ success: true, message: 'Empresa aprobada.' });
};

exports.rechazarEmpresa = async (req, res) => {
  await adminModeracionService.rechazarEmpresa(req.params.id, req.body?.motivo, { actorUsuarioId: req.usuario.id, ip: req.ip, requestId: req.id });
  return res.json({ success: true, message: 'Empresa rechazada.' });
};

// ── Moderación de ofertas ────────────────────────────────────────────────────────

exports.getOfertasPendientes = async (req, res) => {
  const ofertas = await adminModeracionService.listarOfertasPendientes();
  return res.json({ success: true, data: ofertas });
};

exports.getOfertas = async (req, res) => {
  const { estado } = req.query;
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 25, maxLimit: 100 });
  const { data, pagination } = await adminModeracionService.listarOfertas({ estado, page, limit, offset });
  return res.json({ success: true, data, pagination, total: pagination.total });
};

exports.moderarOferta = async (req, res) => {
  const { accion, estado } = await adminModeracionService.moderarOferta(
    req.params.id, req.body, { actorUsuarioId: req.usuario.id, ip: req.ip, requestId: req.id }
  );
  const mensajeAccion = accion === 'aprobar' ? 'aprobada' : accion === 'pausar' ? 'pausada' : accion === 'rechazar' ? 'rechazada' : 'cerrada';
  return res.json({ success: true, message: `Oferta ${mensajeAccion}.`, data: { estado, moderada: true } });
};

// ── Solicitudes de registro de empresa (v1.6) ─────────────────────────────────
// Las 2 rutas de listado son consultas directas (sin lógica de negocio, sin
// service dedicado hoy); aprobar/rechazar delegan 100% a solicitudEmpresaService
// (sin cambios en ese archivo — ver plan REF-ADMIN-01).

exports.getSolicitudesEmpresa = async (req, res) => {
  const { estado } = req.query;
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 25, maxLimit: 100 });
  const where = estado ? { estado } : {};

  const [{ count, rows }, conteoPorEstado] = await Promise.all([
    SolicitudEmpresa.findAndCountAll({ where, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit, offset }),
    groupCount(SolicitudEmpresa, 'estado', {}),
  ]);

  const pagination = buildPagination(count, { page, limit });
  return res.json({ success: true, data: rows, pagination, conteoPorEstado, total: pagination.total });
};

exports.aprobarSolicitudEmpresa = async (req, res) => {
  const resultado = await solicitudEmpresaService.aprobarSolicitud(
    req.params.id,
    { adminUsuarioId: req.usuario.id, ip: req.ip, requestId: req.id }
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
};

exports.rechazarSolicitudEmpresa = async (req, res) => {
  await solicitudEmpresaService.rechazarSolicitud(
    req.params.id,
    { adminUsuarioId: req.usuario.id, ip: req.ip, requestId: req.id },
    req.body.motivo
  );
  return res.json({ success: true, message: 'Solicitud rechazada. Notificación enviada por email.' });
};

// ── Solicitudes de reclutadores (v1.7) ────────────────────────────────────────

exports.getSolicitudesReclutador = async (req, res) => {
  const { estado } = req.query;
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 25, maxLimit: 100 });
  const where = estado ? { estado } : {};

  const [{ count, rows }, conteoPorEstado] = await Promise.all([
    SolicitudReclutador.findAndCountAll({
      where,
      include: [{ model: Empresa, as: 'empresa', attributes: ['id', 'razonSocial', 'usuarioId'] }],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
    }),
    groupCount(SolicitudReclutador, 'estado', {}),
  ]);

  const pagination = buildPagination(count, { page, limit });
  return res.json({ success: true, data: rows, pagination, conteoPorEstado, total: pagination.total });
};

exports.aprobarSolicitudReclutador = async (req, res) => {
  const resultado = await solicitudReclutadorService.aprobarSolicitud(
    req.params.id,
    { adminUsuarioId: req.usuario.id, ip: req.ip, requestId: req.id }
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
};

exports.rechazarSolicitudReclutador = async (req, res) => {
  await solicitudReclutadorService.rechazarSolicitud(
    req.params.id,
    { adminUsuarioId: req.usuario.id, ip: req.ip, requestId: req.id },
    req.body.motivo
  );
  return res.json({ success: true, message: 'Solicitud rechazada. Notificación enviada a la empresa.' });
};

// ── Importación masiva de alumnos/egresados (CSV) ─────────────────────────────

exports.descargarPlantillaCsvAlumnos = async (req, res) => {
  const csv = csvImportacionService.generarPlantillaCsv();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla-importacion-alumnos.csv"');
  return res.send(String.fromCharCode(0xFEFF) + csv); // BOM para que Excel lo abra bien
};

exports.importarAlumnosCsv = async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No se subió ningún archivo CSV.');

  if (req.query.dryRun === 'true') {
    const analisis = await csvImportacionService.analizarCsv(req.file.buffer);
    return res.json({ success: true, dryRun: true, ...analisis });
  }

  const resumen = await csvImportacionService.confirmarImportacion(req.file.buffer, {
    actorUsuarioId: req.usuario.id, ip: req.ip, requestId: req.id,
  });
  return res.status(201).json({ success: true, dryRun: false, ...resumen });
};
