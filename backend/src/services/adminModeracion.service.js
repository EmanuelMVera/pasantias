'use strict';

/**
 * adminModeracion.service.js — REF-ADMIN-01.
 *
 * "Cosas que el admin aprueba/rechaza/modera": empresas (aprobación directa
 * sobre Empresa.estadoAprobacion — distinto del flujo de SolicitudEmpresa) y
 * moderación de ofertas. Extraído literal de admin.routes.js.
 *
 * listarEmpresasPendientes/aprobarEmpresa/rechazarEmpresa no tenían try/catch
 * propio en admin.routes.js — el controller que las use tampoco debe
 * envolverlas: un HttpError o cualquier otro error debe seguir propagando a
 * error.middleware.js exactamente igual que hoy (ver plan REF-ADMIN-01,
 * decisión 2).
 */

const { Empresa, Usuario, Oferta, ActivityLog } = require('../models');
const { crearNotificacion } = require('../utils/notificador');
const HttpError = require('../utils/httpError');
const { buildPagination } = require('../utils/pagination');

async function logAction({ usuarioId, accion, entidad, entidadId, detalle, ip }) {
  try {
    await ActivityLog.create({ usuarioId, accion, entidad, entidadId, detalle, ip });
  } catch (e) {
    console.warn('[ActivityLog] Error al registrar acción:', e.message);
  }
}

// ── Empresas (aprobación directa) ──────────────────────────────────────────────

async function listarEmpresasPendientes() {
  return Empresa.findAll({
    where: { estadoAprobacion: 'pendiente' },
    include: [{ model: Usuario, as: 'usuario', attributes: ['nombre', 'apellido', 'email'] }],
  });
}

async function aprobarEmpresa(id, { actorUsuarioId, ip }) {
  const empresa = await Empresa.findByPk(id);
  if (!empresa) throw new HttpError(404, 'Empresa no encontrada.');

  await empresa.update({
    estadoAprobacion: 'aprobada',
    aprobadaPorUsuarioId: actorUsuarioId,
    aprobadaEn: new Date(),
  });
  await Usuario.update({ habilitado: true }, { where: { id: empresa.usuarioId } });
  await logAction({ usuarioId: actorUsuarioId, accion: 'aprobar_empresa', entidad: 'empresa', entidadId: empresa.id, detalle: { razonSocial: empresa.razonSocial }, ip });
}

async function rechazarEmpresa(id, motivo, { actorUsuarioId, ip }) {
  const empresa = await Empresa.findByPk(id);
  if (!empresa) throw new HttpError(404, 'Empresa no encontrada.');

  await empresa.update({
    estadoAprobacion: 'rechazada',
    motivoRechazo: motivo || null,
  });
  await logAction({ usuarioId: actorUsuarioId, accion: 'rechazar_empresa', entidad: 'empresa', entidadId: empresa.id, detalle: { razonSocial: empresa.razonSocial }, ip });
}

// ── Moderación de ofertas ───────────────────────────────────────────────────────

async function listarOfertasPendientes() {
  return Oferta.findAll({
    where: { moderada: false },
    include: [{ model: Empresa, as: 'empresa', attributes: ['razonSocial', 'rubro'] }],
    order: [['createdAt', 'ASC']],
  });
}

async function listarOfertas({ estado, page = 1, limit = 25, offset = 0 }) {
  const where = {};
  if (estado) where.estado = estado;

  const { count, rows } = await Oferta.findAndCountAll({
    where,
    include: [{ model: Empresa, as: 'empresa', attributes: ['razonSocial', 'rubro'] }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });

  return { data: rows, pagination: buildPagination(count, { page, limit }) };
}

const ACCIONES_VALIDAS = ['aprobar', 'pausar', 'rechazar', 'cerrar'];
const ESTADO_POR_ACCION = {
  aprobar:  'activa',
  pausar:   'pausada',
  rechazar: 'rechazada',
  cerrar:   'cerrada',
};
const NOTIF_POR_ACCION = {
  aprobar:  { titulo: '✅ Tu oferta fue aprobada',  mensaje: (titulo) => `La oferta "${titulo}" fue aprobada y está publicada.`,             tipoVisual: 'success' },
  pausar:   { titulo: '⏸️ Tu oferta fue pausada',   mensaje: (titulo) => `La oferta "${titulo}" fue pausada por el administrador.`,          tipoVisual: 'warning' },
  rechazar: { titulo: '❌ Tu oferta fue rechazada', mensaje: (titulo) => `La oferta "${titulo}" fue rechazada por el administrador.`,         tipoVisual: 'error'   },
  cerrar:   { titulo: '🔒 Tu oferta fue cerrada',   mensaje: (titulo) => `La oferta "${titulo}" fue cerrada por el administrador.`,           tipoVisual: 'info'    },
};

async function moderarOferta(id, body, { actorUsuarioId, ip }) {
  const oferta = await Oferta.findByPk(id);
  if (!oferta) throw new HttpError(404, 'Oferta no encontrada.');

  // Resolver acción — soporta nuevo `accion` y legacy `aprobada`
  let accion = body.accion;
  if (!accion && body.aprobada !== undefined) {
    accion = body.aprobada ? 'aprobar' : 'rechazar';
  }

  if (!ACCIONES_VALIDAS.includes(accion)) {
    throw new HttpError(400, `accion inválida. Válidas: ${ACCIONES_VALIDAS.join(', ')}.`);
  }

  const nuevoEstado = ESTADO_POR_ACCION[accion];
  await oferta.update({ moderada: true, estado: nuevoEstado });

  await logAction({
    usuarioId: actorUsuarioId,
    accion: `${accion}_oferta`,
    entidad: 'oferta',
    entidadId: oferta.id,
    detalle: { titulo: oferta.titulo, nuevoEstado },
    ip,
  });

  // Notificar a la empresa según la acción
  try {
    const empresaOferta = await Empresa.findByPk(oferta.empresaId, { attributes: ['usuarioId'] });
    if (empresaOferta?.usuarioId) {
      const notif = NOTIF_POR_ACCION[accion];
      await crearNotificacion({
        usuarioId: empresaOferta.usuarioId,
        titulo: notif.titulo,
        mensaje: notif.mensaje(oferta.titulo),
        tipo: 'oferta',
        tipoVisual: notif.tipoVisual,
        enlace: '/empresa',
        accionURL: '/empresa',
      });
    }
  } catch (e) { console.error('[Admin] Error notif moderación oferta:', e.message); }

  return { accion, estado: nuevoEstado };
}

module.exports = {
  listarEmpresasPendientes,
  aprobarEmpresa,
  rechazarEmpresa,
  listarOfertasPendientes,
  listarOfertas,
  moderarOferta,
};
