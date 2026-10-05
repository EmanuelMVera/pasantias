'use strict';

const { Oferta, Empresa, Perfil, Postulacion, Usuario } = require('../models');
const { Op } = require('sequelize');
const { crearNotificacion } = require('../utils/notificador');
const { buildPagination } = require('../utils/pagination');
const logger = require('../utils/logger');

const TIPOS_PUESTO_VALIDOS = ['pasante', 'trainee', 'junior'];
const { CARRERAS: CARRERAS_VALIDAS } = require('./catalogo.service');

// ── Visibilidad para alumnos/egresados (RBAC-04) ────────────────────────────
// Única fuente de verdad de "¿esta oferta se puede mostrar a un candidato?":
// ciclo de vida 'activa' Y moderación resuelta a favor. Se usa en TODO
// endpoint que expone ofertas a candidatos (listado público, detalle,
// recomendadas, dashboard de alumno) para no repetir la condición a mano.
const ESTADOS_MODERACION_VISIBLES = ['aprobada', 'auto_aprobada'];

/** Condición Sequelize `where` que determina si una oferta es visible. */
function whereOfertaVisible() {
  return { estado: 'activa', estadoModeracion: { [Op.in]: ESTADOS_MODERACION_VISIBLES } };
}

/** Mismo criterio aplicado a una instancia ya cargada (checks puntuales). */
function esOfertaVisible(oferta) {
  return oferta.estado === 'activa' && ESTADOS_MODERACION_VISIBLES.includes(oferta.estadoModeracion);
}

// Transiciones de ciclo de vida permitidas (PATCH /api/ofertas/:id/estado,
// empresa; y pausar/cerrar del admin en adminModeracion.service.js). No
// incluye 'rechazada': eso es moderación, vive en estadoModeracion, nunca en
// estado. 'cerrada' es terminal — cerrar es una decisión final.
const TRANSICIONES_ESTADO = {
  activa:  ['pausada', 'cerrada'],
  pausada: ['activa', 'cerrada'],
  cerrada: [],
};

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
 * Misma regla de visibilidad que el resto de los endpoints de candidatos
 * (whereOfertaVisible) — antes filtraba solo por estado='activa', sin exigir
 * moderación resuelta, lo que dejaba colar ofertas pendientes (bug RBAC-04).
 * Recibe { page, limit, offset } ya saneados por parsePagination (SCALE-03).
 */
async function obtenerRecomendadas(usuarioId, usuario, { page = 1, limit = 12, offset = 0 } = {}) {
  const perfil = await Perfil.findOne({ where: { usuarioId } });

  const where = { ...whereOfertaVisible() };

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
 * Misma regla de visibilidad que obtenerRecomendadas (whereOfertaVisible).
 * Acepta perfil pre-cargado para evitar query extra.
 */
async function obtenerRecomendadasDashboard(perfil, usuarioId, usuario, limite = 5) {
  try {
    const where = { ...whereOfertaVisible() };

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
    logger.error({ err: e }, 'notif_admin_nueva_oferta_fallo');
  }
}

/**
 * Notifica a los admins cuando una oferta se publica automáticamente por
 * política de confianza (RBAC-05) — ya es visible, sin pasar por moderación
 * previa. El admin sigue pudiendo revisarla y pausarla/rechazarla/cerrarla
 * después (moderación posterior, ver adminModeracion.service.js).
 */
async function notificarAdminsOfertaAutoAprobada(oferta, empresa) {
  try {
    const admins = await Usuario.findAll({ where: { rol: 'admin', activo: true }, attributes: ['id'] });
    await Promise.all(admins.map((admin) =>
      crearNotificacion({
        usuarioId: admin.id,
        titulo: '🤖 Oferta publicada automáticamente',
        mensaje: `La empresa de confianza "${empresa.razonSocial}" publicó una nueva oferta: "${oferta.titulo}". La publicación ya se encuentra visible.`,
        tipo: 'oferta',
        tipoVisual: 'info',
        enlace: '/admin/ofertas',
        accionURL: '/admin/ofertas',
      })
    ));
  } catch (e) {
    logger.error({ err: e }, 'notif_admin_oferta_auto_aprobada_fallo');
  }
}

module.exports = {
  validarCamposPuesto,
  obtenerRecomendadas,
  obtenerRecomendadasDashboard,
  notificarAdminsNuevaOferta,
  notificarAdminsOfertaAutoAprobada,
  whereOfertaVisible,
  esOfertaVisible,
  TRANSICIONES_ESTADO,
};
