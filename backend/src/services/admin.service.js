'use strict';

/**
 * admin.service.js — REF-ADMIN-01.
 *
 * Dashboard/métricas y logs de auditoría del panel de administración.
 * Extraído literal de admin.routes.js — sin cambios de comportamiento.
 */

const { Usuario, Empresa, Oferta, Postulacion, Notificacion, ActivityLog } = require('../models');
const { Op } = require('sequelize');

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

async function listarLogs({ accion, usuarioId, entidad, desde, hasta, page = 1, limit = 25 }) {
  const where = _whereLogs({ accion, usuarioId, entidad, desde, hasta });

  const pageNum  = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const offset   = (pageNum - 1) * limitNum;

  const { count, rows } = await ActivityLog.findAndCountAll({
    where,
    include: [{
      model: Usuario, as: 'usuario',
      attributes: ['nombre', 'apellido', 'email', 'rol'],
      required: false,
    }],
    order: [['createdAt', 'DESC']],
    limit: limitNum,
    offset,
  });

  return {
    total: count,
    page: pageNum,
    totalPages: Math.ceil(count / limitNum),
    data: rows,
  };
}

async function exportarLogsCSV({ accion, usuarioId, entidad, desde, hasta }) {
  const where = _whereLogs({ accion, usuarioId, entidad, desde, hasta });

  const logs = await ActivityLog.findAll({
    where,
    include: [{ model: Usuario, as: 'usuario', attributes: ['nombre', 'apellido', 'email'], required: false }],
    order: [['createdAt', 'DESC']],
    limit: 5000, // Cap para no sobrecargar el servidor
  });

  const header = 'ID,Fecha,Acción,Entidad,EntidadID,Usuario,Email,IP,Detalle\n';
  const rows = logs.map((l) => {
    const u = l.usuario;
    const nombreUsuario = u ? `${u.nombre} ${u.apellido}` : 'Sistema';
    const email = u ? u.email : '';
    const detalle = l.detalle ? JSON.stringify(l.detalle).replace(/"/g, '""') : '';
    return [l.id, new Date(l.createdAt).toISOString(), l.accion, l.entidad || '', l.entidadId || '', nombreUsuario, email, l.ip || '', `"${detalle}"`].join(',');
  });

  return header + rows.join('\n');
}

module.exports = {
  obtenerDashboardGeneral,
  obtenerStats,
  obtenerActividadReciente,
  listarLogs,
  exportarLogsCSV,
};
