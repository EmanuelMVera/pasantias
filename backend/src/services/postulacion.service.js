'use strict';

const { Postulacion, Oferta, Empresa, Perfil, Notificacion } = require('../models');
const HttpError = require('../utils/httpError');

/**
 * Ejecuta todas las validaciones previas a crear una postulación.
 * Lanza HttpError con `code` para cada caso de rechazo.
 * @returns {Promise<Oferta>} la oferta (necesaria para la notificación posterior)
 */
async function validarPostulacion(usuarioId, ofertaId) {
  const perfil = await Perfil.findOne({ where: { usuarioId } });
  if (!perfil || !perfil.cvPath) {
    const err = new HttpError(400, 'Debés subir tu CV antes de postularte. Completá tu perfil primero.');
    err.code = 'CV_REQUERIDO';
    throw err;
  }

  const existe = await Postulacion.findOne({ where: { usuarioId, ofertaId } });
  if (existe) {
    const err = new HttpError(400, 'Ya te postulaste a esta oferta.');
    err.code = 'POSTULACION_DUPLICADA';
    throw err;
  }

  const oferta = await Oferta.findByPk(ofertaId, {
    include: [{ model: Empresa, as: 'empresa' }],
  });

  if (!oferta) {
    const err = new HttpError(404, 'Oferta no encontrada.');
    err.code = 'OFERTA_NOT_FOUND';
    throw err;
  }

  if (oferta.estado !== 'activa') {
    const mensajes = {
      pausada:   'Esta oferta está pausada temporalmente.',
      rechazada: 'Esta oferta no está disponible.',
      cerrada:   'Esta oferta ya está cerrada.',
    };
    const err = new HttpError(400, mensajes[oferta.estado] ?? 'Esta oferta no está disponible.');
    err.code = 'OFERTA_NO_ACTIVA';
    throw err;
  }

  if (oferta.fechaLimite && new Date() > new Date(oferta.fechaLimite)) {
    const err = new HttpError(400, 'El plazo para postularse a esta oferta venció.');
    err.code = 'OFERTA_VENCIDA';
    throw err;
  }

  return oferta;
}

/**
 * Calcula el % de habilidades requeridas por la oferta que posee el candidato.
 * @returns {number|null} 0-100 o null si no hay datos suficientes
 */
function calcularCompatibilidad(perfil, oferta) {
  const requeridas = oferta?.habilidadesRequeridas || [];
  const candidato  = perfil?.habilidades || [];
  if (requeridas.length === 0 || candidato.length === 0) return null;

  const req = requeridas.map((h) => h.toLowerCase().trim());
  const can = candidato.map((h) => h.toLowerCase().trim());
  const coincidencias = req.filter((h) => can.includes(h)).length;

  return Math.round((coincidencias / req.length) * 100);
}

/**
 * Agrega aliases semánticos a una postulación para retrocompatibilidad con el frontend.
 */
function formatearPostulacion(p) {
  const plain = p?.toJSON ? p.toJSON() : p;
  return {
    ...plain,
    estadoActual:         plain.estado,
    ultimaActualizacion:  plain.updatedAt,
    observacionesEmpresa: plain.notasEmpresa,
  };
}

/**
 * Devuelve todos los conteos de postulaciones del alumno para el dashboard.
 */
async function obtenerMetricasAlumno(usuarioId) {
  const [
    totalPostulaciones,
    enRevision,
    preseleccionados,
    entrevistas,
    contrataciones,
    noSeleccionados,
    notificacionesNoLeidas,
  ] = await Promise.all([
    Postulacion.count({ where: { usuarioId } }),
    Postulacion.count({ where: { usuarioId, estado: 'en_revision' } }),
    Postulacion.count({ where: { usuarioId, estado: 'preseleccionado' } }),
    Postulacion.count({ where: { usuarioId, estado: 'entrevista' } }),
    Postulacion.count({ where: { usuarioId, estado: 'contratado' } }),
    Postulacion.count({ where: { usuarioId, estado: 'rechazado' } }),
    Notificacion.count({ where: { usuarioId, leida: false } }),
  ]);

  return {
    totalPostulaciones,
    enRevision,
    preseleccionados,
    entrevistas,
    contrataciones,
    noSeleccionados,
    notificacionesNoLeidas,
  };
}

module.exports = {
  validarPostulacion,
  calcularCompatibilidad,
  formatearPostulacion,
  obtenerMetricasAlumno,
};
