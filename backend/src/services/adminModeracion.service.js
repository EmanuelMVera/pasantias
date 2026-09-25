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

const { Empresa, Usuario, EmpresaUsuario, Oferta } = require('../models');
const { crearNotificacion } = require('../utils/notificador');
const HttpError = require('../utils/httpError');
const { buildPagination } = require('../utils/pagination');
const { registrarAuditoria } = require('../utils/auditLog');
const logger = require('../utils/logger');
const { TRANSICIONES_ESTADO } = require('./oferta.service');
const { obtenerAdminsActivos } = require('./empresa.service');

// ── Empresas (aprobación directa) ──────────────────────────────────────────────

// El admin_empresa ya no cuelga de Empresa directamente (RBAC-06) — se trae
// vía el equipo (EmpresaUsuario) y se aplana a `usuario` para no cambiar la
// forma de la respuesta que ya consumía el resto del código/API.
function _conAdminAplanado(empresa) {
  const data = empresa.toJSON();
  data.usuario = data.equipo?.[0]?.usuario ?? null;
  delete data.equipo;
  return data;
}

const INCLUDE_ADMIN_EMPRESA = {
  model: EmpresaUsuario, as: 'equipo', required: false,
  where: { rolInterno: 'admin_empresa', activo: true },
  include: [{ model: Usuario, as: 'usuario', attributes: ['nombre', 'apellido', 'email'] }],
};

async function listarEmpresasPendientes() {
  const empresas = await Empresa.findAll({
    where: { estadoAprobacion: 'pendiente' },
    include: [INCLUDE_ADMIN_EMPRESA],
  });
  return empresas.map(_conAdminAplanado);
}

async function aprobarEmpresa(id, { actorUsuarioId, ip, requestId }) {
  const empresa = await Empresa.findByPk(id);
  if (!empresa) throw new HttpError(404, 'Empresa no encontrada.');

  await empresa.update({
    estadoAprobacion: 'aprobada',
    aprobadaPorUsuarioId: actorUsuarioId,
    aprobadaEn: new Date(),
  });
  const admins = await obtenerAdminsActivos(empresa.id);
  await Usuario.update({ habilitado: true }, { where: { id: admins.map((a) => a.id) } });
  await registrarAuditoria({ usuarioId: actorUsuarioId, ip, requestId, accion: 'aprobar_empresa', entidad: 'empresa', entidadId: empresa.id, detalle: { razonSocial: empresa.razonSocial } });
}

async function rechazarEmpresa(id, motivo, { actorUsuarioId, ip, requestId }) {
  const empresa = await Empresa.findByPk(id);
  if (!empresa) throw new HttpError(404, 'Empresa no encontrada.');

  await empresa.update({
    estadoAprobacion: 'rechazada',
    motivoRechazo: motivo || null,
  });
  await registrarAuditoria({ usuarioId: actorUsuarioId, ip, requestId, accion: 'rechazar_empresa', entidad: 'empresa', entidadId: empresa.id, detalle: { razonSocial: empresa.razonSocial } });
}

// ── Listado general + nivel de confianza (RBAC-05) ─────────────────────────────

async function listarEmpresas({ estadoAprobacion, nivelConfianza, page = 1, limit = 25, offset = 0 }) {
  const where = {};
  if (estadoAprobacion) where.estadoAprobacion = estadoAprobacion;
  if (nivelConfianza) where.nivelConfianza = nivelConfianza;

  const { count, rows } = await Empresa.findAndCountAll({
    where,
    include: [INCLUDE_ADMIN_EMPRESA],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });

  return { data: rows.map(_conAdminAplanado), pagination: buildPagination(count, { page, limit }) };
}

const ACCIONES_CONFIANZA = ['marcar', 'revocar'];
const CONFIANZA_POR_ACCION = { marcar: 'confiable', revocar: 'estandar' };

// Cambia el nivel de confianza institucional de una empresa. Nunca toca
// retroactivamente ofertas/solicitudes ya resueltas con la política vigente
// al momento de crearlas — solo afecta operaciones nuevas de ahí en más.
async function cambiarNivelConfianza(id, accion, { actorUsuarioId, ip, requestId }) {
  const empresa = await Empresa.findByPk(id);
  if (!empresa) throw new HttpError(404, 'Empresa no encontrada.');

  if (!ACCIONES_CONFIANZA.includes(accion)) {
    throw new HttpError(400, `accion inválida. Válidas: ${ACCIONES_CONFIANZA.join(', ')}.`);
  }

  const nivelNuevo = CONFIANZA_POR_ACCION[accion];
  if (empresa.nivelConfianza === nivelNuevo) {
    throw new HttpError(400, `La empresa ya es '${nivelNuevo}'.`);
  }

  const nivelAnterior = empresa.nivelConfianza;
  await empresa.update({ nivelConfianza: nivelNuevo });

  await registrarAuditoria({
    usuarioId: actorUsuarioId, ip, requestId,
    accion: accion === 'marcar' ? 'marcar_empresa_confiable' : 'revocar_confianza_empresa',
    entidad: 'empresa',
    entidadId: empresa.id,
    detalle: { razonSocial: empresa.razonSocial, nivelAnterior, nivelNuevo },
  });

  return { nivelConfianza: nivelNuevo };
}

// ── Moderación de ofertas ───────────────────────────────────────────────────────

async function listarOfertasPendientes() {
  return Oferta.findAll({
    where: { estadoModeracion: 'pendiente' },
    include: [{ model: Empresa, as: 'empresa', attributes: ['razonSocial', 'rubro'] }],
    order: [['createdAt', 'ASC']],
  });
}

async function listarOfertas({ estado, estadoModeracion, page = 1, limit = 25, offset = 0 }) {
  const where = {};
  if (estado) where.estado = estado;
  if (estadoModeracion) where.estadoModeracion = estadoModeracion;

  const { count, rows } = await Oferta.findAndCountAll({
    where,
    include: [{ model: Empresa, as: 'empresa', attributes: ['razonSocial', 'rubro'] }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });

  return { data: rows, pagination: buildPagination(count, { page, limit }) };
}

// Dos ejes independientes que el admin puede tocar acá — nunca mezclados en
// la misma escritura (RBAC-04):
//   - Moderación (estadoModeracion): aprobar / rechazar.
//   - Ciclo de vida (estado): pausar / cerrar — mismas transiciones que ya
//     usa la empresa vía PATCH /api/ofertas/:id/estado (TRANSICIONES_ESTADO).
const ACCIONES_MODERACION = ['aprobar', 'rechazar'];
const MODERACION_POR_ACCION = { aprobar: 'aprobada', rechazar: 'rechazada' };
// Transiciones de moderación válidas — exactamente las 4 pedidas: pendiente
// puede resolverse en cualquier sentido; auto_aprobada y aprobada solo
// pueden retroceder a rechazada (nunca al revés: rechazada es terminal).
const TRANSICIONES_MODERACION = {
  pendiente:     ['aprobada', 'rechazada'],
  auto_aprobada: ['rechazada'],
  aprobada:      ['rechazada'],
  rechazada:     [],
};

const ACCIONES_ESTADO = ['pausar', 'cerrar'];
const ESTADO_POR_ACCION = { pausar: 'pausada', cerrar: 'cerrada' };

const NOTIF_POR_ACCION = {
  aprobar:  { titulo: '✅ Tu oferta fue aprobada',  mensaje: (titulo) => `La oferta "${titulo}" fue aprobada y está publicada.`,             tipoVisual: 'success' },
  rechazar: { titulo: '❌ Tu oferta fue rechazada', mensaje: (titulo) => `La oferta "${titulo}" fue rechazada por el administrador.`,         tipoVisual: 'error'   },
  pausar:   { titulo: '⏸️ Tu oferta fue pausada',   mensaje: (titulo) => `La oferta "${titulo}" fue pausada por el administrador.`,          tipoVisual: 'warning' },
  cerrar:   { titulo: '🔒 Tu oferta fue cerrada',   mensaje: (titulo) => `La oferta "${titulo}" fue cerrada por el administrador.`,           tipoVisual: 'info'    },
};

async function notificarEmpresa(oferta, accion) {
  try {
    const admins = await obtenerAdminsActivos(oferta.empresaId);
    const notif = NOTIF_POR_ACCION[accion];
    await Promise.all(admins.map((admin) => crearNotificacion({
      usuarioId: admin.id,
      titulo: notif.titulo,
      mensaje: notif.mensaje(oferta.titulo),
      tipo: 'oferta',
      tipoVisual: notif.tipoVisual,
      enlace: '/empresa',
      accionURL: '/empresa',
    })));
  } catch (e) { logger.error({ err: e }, 'notif_moderacion_oferta_fallo'); }
}

async function moderarOferta(id, body, { actorUsuarioId, ip, requestId }) {
  const oferta = await Oferta.findByPk(id);
  if (!oferta) throw new HttpError(404, 'Oferta no encontrada.');

  // Resolver acción — soporta nuevo `accion` y legacy `aprobada`
  let accion = body.accion;
  if (!accion && body.aprobada !== undefined) {
    accion = body.aprobada ? 'aprobar' : 'rechazar';
  }

  if (ACCIONES_MODERACION.includes(accion)) {
    const nuevoEstadoModeracion = MODERACION_POR_ACCION[accion];
    const transicionesValidas = TRANSICIONES_MODERACION[oferta.estadoModeracion] || [];
    if (!transicionesValidas.includes(nuevoEstadoModeracion)) {
      throw new HttpError(400, `No se puede pasar de moderación '${oferta.estadoModeracion}' a '${nuevoEstadoModeracion}'.`);
    }

    await oferta.update({ estadoModeracion: nuevoEstadoModeracion });

    await registrarAuditoria({
      usuarioId: actorUsuarioId, ip, requestId,
      accion: `${accion}_oferta`,
      entidad: 'oferta',
      entidadId: oferta.id,
      detalle: { titulo: oferta.titulo, nuevoEstadoModeracion },
    });
    await notificarEmpresa(oferta, accion);

    return { accion, estadoModeracion: nuevoEstadoModeracion };
  }

  if (ACCIONES_ESTADO.includes(accion)) {
    const nuevoEstado = ESTADO_POR_ACCION[accion];
    const transicionesValidas = TRANSICIONES_ESTADO[oferta.estado] || [];
    if (!transicionesValidas.includes(nuevoEstado)) {
      throw new HttpError(400, `No se puede pasar de '${oferta.estado}' a '${nuevoEstado}'.`);
    }

    await oferta.update({ estado: nuevoEstado });

    await registrarAuditoria({
      usuarioId: actorUsuarioId, ip, requestId,
      accion: `${accion}_oferta`,
      entidad: 'oferta',
      entidadId: oferta.id,
      detalle: { titulo: oferta.titulo, nuevoEstado },
    });
    await notificarEmpresa(oferta, accion);

    return { accion, estado: nuevoEstado };
  }

  throw new HttpError(400, `accion inválida. Válidas: ${[...ACCIONES_MODERACION, ...ACCIONES_ESTADO].join(', ')}.`);
}

module.exports = {
  listarEmpresasPendientes,
  aprobarEmpresa,
  rechazarEmpresa,
  listarEmpresas,
  cambiarNivelConfianza,
  listarOfertasPendientes,
  listarOfertas,
  moderarOferta,
};
