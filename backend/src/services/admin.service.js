'use strict';

/**
 * admin.service.js — REF-ADMIN-01.
 *
 * Dashboard/métricas y logs de auditoría del panel de administración.
 * Extraído literal de admin.routes.js — sin cambios de comportamiento.
 */

const { Usuario, Empresa, Oferta, Postulacion, Notificacion, ActivityLog } = require('../models');
const { Op } = require('sequelize');
const { buildPagination } = require('../utils/pagination');
const { escaparCeldaCsv } = require('../utils/csv');

async function obtenerDashboardGeneral() {
  const [
    alumnosActivos, egresadosActivos,
    empresasAprobadas, totalUsuarios, ofertasActivas,
    ofertasPendiente, totalPostulaciones, contrataciones,
    entrevistas, notificacionesPendientes,
  ] = await Promise.all([
    Usuario.count({ where: { rol: 'alumno',   activo: true } }),
    Usuario.count({ where: { rol: 'egresado', activo: true } }),
    Empresa.count({ where: { estadoAprobacion: 'aprobada' } }),
    Usuario.count({ where: { activo: true } }),
    Oferta.count({ where: { estado: 'activa', moderada: true } }),
    Oferta.count({ where: { moderada: false } }),
    Postulacion.count(),
    Postulacion.count({ where: { estado: 'contratado' } }),
    Postulacion.count({ where: { estado: 'entrevista' } }),
    Notificacion.count({ where: { leida: false } }),
  ]);

  const tasaInsercion = totalPostulaciones > 0
    ? ((contrataciones / totalPostulaciones) * 100).toFixed(1) + '%'
    : '0%';

  const actividadReciente = await Postulacion.findAll({
    limit: 10,
    order: [['createdAt', 'DESC']],
    include: [
      { model: Usuario, as: 'usuario', attributes: ['nombre', 'apellido', 'email', 'rol'] },
      {
        model: Oferta, as: 'oferta', attributes: ['titulo', 'area'],
        include: [{ model: Empresa, as: 'empresa', attributes: ['razonSocial'] }],
      },
    ],
  });

  return {
    usuarios: { alumnosActivos, egresadosActivos, empresasAprobadas, totalActivos: totalUsuarios },
    pasantias: { ofertasActivas, ofertasPendienteModeracion: ofertasPendiente, totalPostulaciones, entrevistas, contrataciones, tasaInsercion },
    sistema: { notificacionesPendientes },
    actividadReciente,
  };
}

async function obtenerStats() {
  const [totalUsuarios, totalEmpresas, totalOfertas, totalPostulaciones] = await Promise.all([
    Usuario.count({ where: { rol: ['alumno', 'egresado'] } }),
    Empresa.count(),
    Oferta.count(),
    Postulacion.count(),
  ]);
  const contratados = await Postulacion.count({ where: { estado: 'contratado' } });
  return {
    totalUsuarios, totalEmpresas, totalOfertas, totalPostulaciones, contratados,
    tasaInsercion: totalPostulaciones > 0
      ? ((contratados / totalPostulaciones) * 100).toFixed(1) + '%' : '0%',
  };
}

async function obtenerActividadReciente() {
  return ActivityLog.findAll({
    limit: 20,
    order: [['createdAt', 'DESC']],
    include: [{ model: Usuario, as: 'usuario', attributes: ['nombre', 'apellido', 'email', 'rol'] }],
  });
}

function _whereLogs({ accion, usuarioId, entidad, desde, hasta }) {
  const where = {};
  if (accion)    where.accion    = accion;
  if (usuarioId) where.usuarioId = usuarioId;
  if (entidad)   where.entidad   = entidad;
  if (desde || hasta) {
    where.createdAt = {};
    if (desde) where.createdAt[Op.gte] = new Date(desde);
    if (hasta) where.createdAt[Op.lte] = new Date(hasta);
  }
  return where;
}

async function listarLogs({ accion, usuarioId, entidad, desde, hasta, page = 1, limit = 25, offset = 0 }) {
  const where = _whereLogs({ accion, usuarioId, entidad, desde, hasta });

  const { count, rows } = await ActivityLog.findAndCountAll({
    where,
    include: [{
      model: Usuario, as: 'usuario',
      attributes: ['nombre', 'apellido', 'email', 'rol'],
      required: false,
    }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });

  return { data: rows, pagination: buildPagination(count, { page, limit }) };
}

// Límite duro compartido por los 3 formatos de exportación (CSV/XLSX/PDF):
// no cargar en memoria más de esto de una — sección 14 del pedido.
const LOGS_EXPORT_LIMIT = 5000;

/**
 * Query compartida por los 3 formatos de exportación de logs — mismos
 * filtros, mismo orden, mismo cap. Reusada por export.service.js (XLSX/PDF)
 * para que nunca diverjan del CSV.
 */
async function obtenerLogsParaExport({ accion, usuarioId, entidad, desde, hasta }) {
  const where = _whereLogs({ accion, usuarioId, entidad, desde, hasta });
  return ActivityLog.findAll({
    where,
    include: [{ model: Usuario, as: 'usuario', attributes: ['nombre', 'apellido', 'email'], required: false }],
    order: [['createdAt', 'DESC']],
    limit: LOGS_EXPORT_LIMIT,
  });
}

async function exportarLogsCSV(filtros) {
  const logs = await obtenerLogsParaExport(filtros);

  const header = 'ID,Fecha,Acción,Entidad,EntidadID,Usuario,Email,IP,Detalle\n';
  const rows = logs.map((l) => {
    const u = l.usuario;
    const nombreUsuario = u ? `${u.nombre} ${u.apellido}` : 'Sistema';
    const email = u ? u.email : '';
    const detalle = l.detalle ? JSON.stringify(l.detalle) : '';
    // Cada celda pasa por escaparCeldaCsv: nombre/email/entidad pueden venir
    // de datos controlados por el usuario (ej. alguien se registró con un
    // nombre que empieza con "=") — sin esto, abrir el CSV en Excel/Sheets
    // podría ejecutar una fórmula (CSV injection).
    return [l.id, new Date(l.createdAt).toISOString(), l.accion, l.entidad || '', l.entidadId || '', nombreUsuario, email, l.ip || '', detalle]
      .map(escaparCeldaCsv)
      .join(',');
  });

  return header + rows.join('\n');
}

module.exports = {
  obtenerDashboardGeneral,
  obtenerStats,
  obtenerActividadReciente,
  listarLogs,
  exportarLogsCSV,
  obtenerLogsParaExport,
  LOGS_EXPORT_LIMIT,
};
