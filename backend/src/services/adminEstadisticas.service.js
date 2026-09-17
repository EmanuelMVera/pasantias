'use strict';

/**
 * adminEstadisticas.service.js — estadísticas profesionales del panel de
 * administración (sección 12 del pedido de iteración funcional/visual).
 *
 * Todas las métricas salen de modelos existentes — ninguna se inventa. Toda
 * tasa/porcentaje usa pct() para nunca dividir por cero (denominador 0 →
 * null, nunca un 0% engañoso; el frontend lo muestra como "—").
 */

const { Op } = require('sequelize');
const {
  sequelize, Usuario, Empresa, EmpresaUsuario, Oferta, Postulacion, PostulacionHistorialEstado,
} = require('../models');
const { groupCount } = require('../utils/pagination');

const PERIODO_DEFAULT_DIAS = 30;

function pct(num, den) {
  if (!den) return null;
  return Math.round((num / den) * 1000) / 10; // 1 decimal
}

/**
 * Resuelve el rango [fechaDesde, fechaHasta] a partir de un `periodoDias`
 * (7/30/90/365, default 30) o un rango explícito `desde`/`hasta`.
 */
/**
 * Embudo de selección — conteos ACUMULADOS ("¿cuántas postulaciones llegaron
 * ALGUNA VEZ a esta etapa?"), no el conteo de `Postulacion.estado` actual.
 *
 * `Postulacion.estado` es un único valor mutable — una postulación
 * "contratada" ya NO figura como "entrevista". Si el embudo contara
 * `estado` actual, cada etapa sería un balde disjunto de las demás y
 * "tasaContratadoAEntrevista = contratado/entrevista" podría dar más de
 * 100% (ocurrió en la práctica: dos postulaciones "contratado" y una sola
 * "entrevista" en un dataset real → 200%, un número sin sentido).
 *
 * La fuente correcta es PostulacionHistorialEstado: cuenta postulaciones
 * DISTINTAS que en algún momento tuvieron un registro con
 * `estadoNuevo = X` — eso sí es monótonamente no creciente etapa a etapa
 * (nadie llega a "contratado" sin haber pasado, en algún momento, por
 * "entrevista" en la cadena que arma postulacion.controller.js), así que
 * las tasas siempre quedan entre 0% y 100%.
 */
async function calcularEmbudo() {
  const [totalPostulaciones, preseleccionado, entrevista, contratado] = await Promise.all([
    Postulacion.count(),
    PostulacionHistorialEstado.count({ where: { estadoNuevo: 'preseleccionado' }, distinct: true, col: 'postulacionId' }),
    PostulacionHistorialEstado.count({ where: { estadoNuevo: 'entrevista' }, distinct: true, col: 'postulacionId' }),
    PostulacionHistorialEstado.count({ where: { estadoNuevo: 'contratado' }, distinct: true, col: 'postulacionId' }),
  ]);

  return {
    enRevision: totalPostulaciones, // toda postulación arranca en "en_revision"
    preseleccionado,
    entrevista,
    contratado,
    tasaPreseleccionARevision: pct(preseleccionado, totalPostulaciones),
    tasaEntrevistaAPreseleccion: pct(entrevista, preseleccionado),
    tasaContratadoAEntrevista: pct(contratado, entrevista),
  };
}

function resolverRango({ desde, hasta, periodoDias } = {}) {
  const fechaHasta = hasta ? new Date(hasta) : new Date();
  let fechaDesde;
  if (desde) {
    fechaDesde = new Date(desde);
  } else {
    const dias = Number(periodoDias) > 0 ? Number(periodoDias) : PERIODO_DEFAULT_DIAS;
    fechaDesde = new Date(fechaHasta.getTime() - dias * 24 * 60 * 60 * 1000);
  }
  return { fechaDesde, fechaHasta };
}

/**
 * Estadísticas generales del sistema. Filtros: `periodoDias` (7|30|90|365) o
 * `desde`/`hasta` explícitos — gobiernan las métricas "del período"
 * (postulaciones, contrataciones, altas de usuarios); los conteos de estado
 * actual (empresas por estado, ofertas por estado) son siempre "a hoy", no
 * tiene sentido filtrarlos por fecha de creación.
 */
async function obtenerEstadisticasGenerales({ desde, hasta, periodoDias } = {}) {
  const { fechaDesde, fechaHasta } = resolverRango({ desde, hasta, periodoDias });
  const wherePeriodo = { createdAt: { [Op.gte]: fechaDesde, [Op.lte]: fechaHasta } };

  const [
    alumnos, egresados, totalUsuariosActivos,
    empresasPorEstado,
    reclutadoresActivos,
    ofertasPorEstado, ofertasPendienteModeracion,
    postulacionesTotal, postulacionesPeriodo,
    contratacionesTotal, contratacionesPeriodo,
    altasUsuariosPeriodo,
    embudo,
    ofertasPorArea,
    empresasTopRaw,
    aprobacionEmpresas,
  ] = await Promise.all([
    Usuario.count({ where: { rol: 'alumno', activo: true } }),
    Usuario.count({ where: { rol: 'egresado', activo: true } }),
    Usuario.count({ where: { activo: true } }),
    groupCount(Empresa, 'estadoAprobacion', {}),
    EmpresaUsuario.count({ where: { rolInterno: 'reclutador', activo: true } }),
    groupCount(Oferta, 'estado', {}),
    Oferta.count({ where: { moderada: false } }),
    Postulacion.count(),
    Postulacion.count({ where: wherePeriodo }),
    Postulacion.count({ where: { estado: 'contratado' } }),
    Postulacion.count({ where: { estado: 'contratado', ...wherePeriodo } }),
    Usuario.count({ where: { rol: { [Op.in]: ['alumno', 'egresado'] }, ...wherePeriodo } }),
    calcularEmbudo(),
    groupCount(Oferta, 'area', {}),
    Oferta.findAll({
      attributes: ['empresaId', [sequelize.fn('COUNT', sequelize.col('id')), 'totalOfertas']],
      group: ['empresaId'],
      order: [[sequelize.literal('"totalOfertas"'), 'DESC']],
      limit: 5,
      raw: true,
    }),
    Empresa.findAll({
      where: { estadoAprobacion: 'aprobada', aprobadaEn: { [Op.ne]: null } },
      attributes: ['createdAt', 'aprobadaEn'],
    }),
  ]);

  const empresaIds = empresasTopRaw.map((e) => e.empresaId);
  const empresasInfo = empresaIds.length
    ? await Empresa.findAll({ where: { id: { [Op.in]: empresaIds } }, attributes: ['id', 'razonSocial'] })
    : [];
  const nombrePorId = new Map(empresasInfo.map((e) => [e.id, e.razonSocial]));
  const empresasConMasOfertas = empresasTopRaw.map((e) => ({
    empresaId: e.empresaId,
    razonSocial: nombrePorId.get(e.empresaId) || `Empresa #${e.empresaId}`,
    totalOfertas: Number(e.totalOfertas),
  }));

  const tiempoPromedioAprobacionDias = aprobacionEmpresas.length
    ? Math.round(
        (aprobacionEmpresas.reduce((acc, e) => acc + (new Date(e.aprobadaEn) - new Date(e.createdAt)), 0)
          / aprobacionEmpresas.length) / (24 * 60 * 60 * 1000) * 10
      ) / 10
    : null;

  return {
    periodo: { desde: fechaDesde.toISOString(), hasta: fechaHasta.toISOString() },
    usuarios: {
      totalActivos: totalUsuariosActivos,
      alumnos,
      egresados,
      altasEnPeriodo: altasUsuariosPeriodo,
    },
    empresas: {
      aprobadas: empresasPorEstado.aprobada || 0,
      pendientes: empresasPorEstado.pendiente || 0,
      rechazadas: empresasPorEstado.rechazada || 0,
      reclutadoresActivos,
      tiempoPromedioAprobacionDias,
      conMasOfertas: empresasConMasOfertas,
    },
    ofertas: {
      activas: ofertasPorEstado.activa || 0,
      pausadas: ofertasPorEstado.pausada || 0,
      cerradas: ofertasPorEstado.cerrada || 0,
      rechazadas: ofertasPorEstado.rechazada || 0,
      pendienteModeracion: ofertasPendienteModeracion,
      porArea: ofertasPorArea,
    },
    postulaciones: {
      total: postulacionesTotal,
      enPeriodo: postulacionesPeriodo,
    },
    contrataciones: {
      total: contratacionesTotal,
      enPeriodo: contratacionesPeriodo,
      tasaContratacion: pct(contratacionesTotal, postulacionesTotal),
    },
    embudo,
  };
}

module.exports = { obtenerEstadisticasGenerales, calcularEmbudo, resolverRango, pct };
