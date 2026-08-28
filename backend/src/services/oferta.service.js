'use strict';

const { Oferta, Empresa, Perfil, Postulacion, Usuario } = require('../models');
const { Op } = require('sequelize');
const { crearNotificacion } = require('../utils/notificador');
const { buildPagination } = require('../utils/pagination');

const TIPOS_PUESTO_VALIDOS = ['pasante', 'trainee', 'junior'];
const CARRERAS_VALIDAS = require('../data/catalogos.json').carreras;

/**
 * Valida y normaliza los campos de tipo puesto/experiencia de una oferta.
 * @returns {{ error: string|null, campos: object }}
 */
function validarCamposPuesto(body) {
  const { tipoPuesto, requiereExperiencia, experienciaDetalle, carrerasDestinatarias } = body;

  if (tipoPuesto !== undefined && tipoPuesto !== null && tipoPuesto !== '') {
    if (!TIPOS_PUESTO_VALIDOS.includes(tipoPuesto)) {
      return { error: `tipoPuesto inválido. Valores permitidos: ${TIPOS_PUESTO_VALIDOS.join(', ')}.` };
    }
  }

  let nivelExperienciaLegacy;
  if (tipoPuesto === 'junior') {
    nivelExperienciaLegacy = 'junior';
  } else if (tipoPuesto === 'pasante' || tipoPuesto === 'trainee') {
    nivelExperienciaLegacy = 'sin_experiencia';
  }

  // pasante nunca requiere experiencia
  let requiereExp = requiereExperiencia;
  if (tipoPuesto === 'pasante') requiereExp = false;

  const detalle = requiereExp ? (experienciaDetalle || null) : null;

  const carreras = Array.isArray(carrerasDestinatarias)
    ? carrerasDestinatarias.filter((c) => typeof c === 'string' && c.trim())
    : [];

  if (carreras.length > 0) {
    const invalidas = carreras.filter((c) => !CARRERAS_VALIDAS.includes(c));
    if (invalidas.length > 0) {
      return { error: `Carreras destinatarias inválidas: ${invalidas.join(', ')}.` };
    }
  }

  return {
    error: null,
    campos: {
      ...(tipoPuesto !== undefined && { tipoPuesto: tipoPuesto || null }),
      ...(requiereExp !== undefined && { requiereExperiencia: requiereExp }),
      ...(detalle !== undefined && { experienciaDetalle: detalle }),
      ...(carrerasDestinatarias !== undefined && { carrerasDestinatarias: carreras }),
      ...(nivelExperienciaLegacy && { nivelExperiencia: nivelExperienciaLegacy }),
    },
  };
}

/**
 * Ofertas recomendadas para el endpoint /api/ofertas/recomendadas (con paginación).
 * Solo ofertas activas; no requiere moderada=true (alumnos ven aunque esté pendiente).
 * Recibe { page, limit, offset } ya saneados por parsePagination (SCALE-03).
 */
async function obtenerRecomendadas(usuarioId, usuario, { page = 1, limit = 12, offset = 0 } = {}) {
  const perfil = await Perfil.findOne({ where: { usuarioId } });

  const where = { estado: 'activa' };

  const postuladas = await Postulacion.findAll({ where: { usuarioId }, attributes: ['ofertaId'] });
  const idsPostuladas = postuladas.map((p) => p.ofertaId);
  if (idsPostuladas.length > 0) where.id = { [Op.notIn]: idsPostuladas };

  const orConditions = [];
  if (perfil?.areaInteres)         orConditions.push({ area: { [Op.iLike]: `%${perfil.areaInteres}%` } });
  if (perfil?.carrera) {
    orConditions.push({ carrerasDestinatarias: { [Op.contains]: [perfil.carrera] } });
    orConditions.push({ area: { [Op.iLike]: `%${perfil.carrera}%` } });
  }
  if (perfil?.habilidades?.length > 0) orConditions.push({ habilidadesRequeridas: { [Op.overlap]: perfil.habilidades } });
  if (usuario?.ubicacion)              orConditions.push({ ciudad: { [Op.iLike]: `%${usuario.ubicacion}%` } });

  if (orConditions.length > 0) where[Op.or] = orConditions;

  const { count, rows: ofertas } = await Oferta.findAndCountAll({
    where,
    include: [{ model: Empresa, as: 'empresa', attributes: ['razonSocial', 'logo', 'rubro', 'ciudad'] }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });

  return {
    data: ofertas,
    pagination: buildPagination(count, { page, limit }),
    criterios: {
      areaInteres: perfil?.areaInteres || null,
      habilidades: perfil?.habilidades || [],
      ubicacion: usuario?.ubicacion || null,
      perfilConfigurado: orConditions.length > 0,
    },
  };
}

/**
 * Top N ofertas recomendadas para el dashboard del alumno.
 * Requiere moderada=true (solo muestra ofertas ya revisadas por el admin).
 * Acepta perfil pre-cargado para evitar query extra.
 */
async function obtenerRecomendadasDashboard(perfil, usuarioId, usuario, limite = 5) {
  try {
    const where = { estado: 'activa', moderada: true };

    const postuladas = await Postulacion.findAll({ where: { usuarioId }, attributes: ['ofertaId'] });
    const idsPostuladas = postuladas.map((p) => p.ofertaId);
    if (idsPostuladas.length > 0) where.id = { [Op.notIn]: idsPostuladas };

    const orConditions = [];
    if (perfil?.areaInteres)         orConditions.push({ area: { [Op.iLike]: `%${perfil.areaInteres}%` } });
    if (perfil?.habilidades?.length > 0) orConditions.push({ habilidadesRequeridas: { [Op.overlap]: perfil.habilidades } });
    if (usuario?.ubicacion)              orConditions.push({ ciudad: { [Op.iLike]: `%${usuario.ubicacion}%` } });

    if (orConditions.length > 0) where[Op.or] = orConditions;

    return await Oferta.findAll({
      where,
      include: [{ model: Empresa, as: 'empresa', attributes: ['razonSocial', 'logo', 'rubro', 'ciudad'] }],
      order: [['createdAt', 'DESC']],
      limit: limite,
    });
  } catch {
    return [];
  }
}

/**
 * Notifica a todos los admins activos sobre una nueva oferta pendiente de moderación.
 * Fire-and-forget: los errores son silenciados para no interrumpir la creación de la oferta.
 */
async function notificarAdminsNuevaOferta(oferta, empresa) {
  try {
    const admins = await Usuario.findAll({ where: { rol: 'admin', activo: true }, attributes: ['id'] });
    await Promise.all(admins.map((admin) =>
      crearNotificacion({
        usuarioId: admin.id,
        titulo: '📋 Nueva oferta pendiente de moderación',
        mensaje: `La empresa "${empresa.razonSocial}" publicó "${oferta.titulo}". Revisala en el panel de ofertas.`,
        tipo: 'oferta',
        tipoVisual: 'info',
        enlace: '/admin/ofertas',
        accionURL: '/admin/ofertas',
      })
    ));
  } catch (e) {
    console.error('[Oferta] Error notif admin moderación:', e.message);
  }
}

module.exports = {
  validarCamposPuesto,
  obtenerRecomendadas,
  obtenerRecomendadasDashboard,
  notificarAdminsNuevaOferta,
};
