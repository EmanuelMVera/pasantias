'use strict';

const {
  Oferta, Postulacion, Perfil, Usuario, Empresa, EmpresaUsuario, SolicitudReclutador, sequelize,
} = require('../models');
const { Op } = require('sequelize');
const { buildPagination, groupCount } = require('../utils/pagination');
const HttpError = require('../utils/httpError');
const { comparteMismaEmpresa, puedeVerConversacion } = require('./chatPermission.service');

// Resolución canónica de empresa para un request autenticado.
// Orden: (1) req.empresa inyectado por middleware → (2) membresía activa en
// empresa_usuarios (única fuente de verdad desde RBAC-06 — cubre reclutador
// y admin_empresa por igual).
async function resolverEmpresaDelRequest(req) {
  if (req.empresa) return req.empresa;

  const membresia = await EmpresaUsuario.findOne({
    where: { usuarioId: req.usuario.id, activo: true },
    include: [{ model: Empresa, as: 'empresa' }],
  });
  return membresia?.empresa ?? null;
}

/**
 * Devuelve los admin_empresa ACTIVOS de una empresa — normalmente uno solo
 * (hoy no hay forma de crear más de uno desde la UI), pero el helper está
 * pensado para notificar/habilitar a todos si en el futuro eso cambiara
 * (RBAC-06 — reemplaza el uso de Empresa.usuarioId como "el dueño").
 * @returns {Promise<Usuario[]>}
 */
async function obtenerAdminsActivos(empresaId) {
  const membresias = await EmpresaUsuario.findAll({
    where: { empresaId, rolInterno: 'admin_empresa', activo: true },
    include: [{ model: Usuario, as: 'usuario' }],
  });
  return membresias.map((m) => m.usuario).filter(Boolean);
}

/**
 * Reclutador responsable de una oferta, solo si sigue siendo un reclutador
 * ACTIVO de la empresa dueña de la oferta. Devuelve null para ofertas sin
 * responsable (históricas), o cuyo creador fue suspendido/quitado o no es
 * reclutador.
 * @returns {Promise<Usuario|null>}
 */
async function obtenerReclutadorResponsable(oferta) {
  if (!oferta.creadaPorUsuarioId) return null;
  const membresia = await EmpresaUsuario.findOne({
    where: {
      empresaId: oferta.empresaId,
      usuarioId: oferta.creadaPorUsuarioId,
      rolInterno: 'reclutador',
      activo: true,
    },
    include: [{ model: Usuario, as: 'usuario' }],
  });
  return membresia?.usuario?.activo ? membresia.usuario : null;
}

/**
 * Destinatarios de la notificación "nueva postulación" de una oferta.
 *
 * Regla (gobierno vs. operación): la postulación es trabajo OPERATIVO, así que
 * se avisa al RECLUTADOR RESPONSABLE de la oferta (`creadaPorUsuarioId`),
 * siempre que siga siendo un reclutador activo de esa empresa. El
 * admin_empresa NO recibe cada postulación (era ruido).
 *
 * Fallback para no perder el evento: si la oferta no tiene un responsable
 * válido (oferta histórica sin `creadaPorUsuarioId`, responsable suspendido o
 * quitado del equipo, o una oferta cuyo creador no es reclutador) se avisa a
 * los admin_empresa activos. Nunca a ambos a la vez.
 *
 * @param {{ empresaId: number, creadaPorUsuarioId: number|null }} oferta
 * @returns {Promise<Usuario[]>}
 */
async function obtenerDestinatariosPostulacion(oferta) {
  const responsable = await obtenerReclutadorResponsable(oferta);
  return responsable ? [responsable] : obtenerAdminsActivos(oferta.empresaId);
}

const ATRIBUTOS_RESPONSABLE = ['id', 'nombre', 'apellido'];

/** { ofertaId: totalPostulaciones } para un conjunto de ofertas (un solo GROUP BY). */
async function contarPostulacionesPorOferta(ofertaIds) {
  if (ofertaIds.length === 0) return {};
  const filas = await Postulacion.findAll({
    where: { ofertaId: { [Op.in]: ofertaIds } },
    attributes: ['ofertaId', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
    group: ['ofertaId'],
    raw: true,
  });
  return filas.reduce((acc, f) => { acc[f.ofertaId] = parseInt(f.total, 10); return acc; }, {});
}

/**
 * Métricas del dashboard de la empresa (GET /api/empresas/dashboard).
 *
 * Todo es de alcance EMPRESA (no del usuario que consulta). Consultas fijas,
 * sin N+1: una lista liviana de ofertas, los conteos de postulaciones por
 * estado, un GROUP BY de postulaciones por oferta (alimenta el top y las
 * recientes) y los conteos de equipo.
 *
 * `equipo.totalMiembros` conserva su significado (membresías activas, incluye
 * al admin_empresa). `equipo.reclutadoresActivos` cuenta solo reclutadores.
 */
async function obtenerMetricasDashboard(empresaId) {
  const ofertas = await Oferta.findAll({
    where: { empresaId },
    attributes: ['id', 'titulo', 'estado', 'estadoModeracion', 'creadaPorUsuarioId'],
    include: [{ model: Usuario, as: 'creadaPor', attributes: ATRIBUTOS_RESPONSABLE }],
  });
  const ofertaIds = ofertas.map((o) => o.id);

  const ofertasActivas             = ofertas.filter((o) => o.estado === 'activa').length;
  const ofertasPausadas            = ofertas.filter((o) => o.estado === 'pausada').length;
  const ofertasCerradas            = ofertas.filter((o) => o.estado === 'cerrada').length;
  const ofertasPendienteModeracion = ofertas.filter((o) => o.estadoModeracion === 'pendiente').length;

  const wherePost = ofertaIds.length > 0 ? { ofertaId: ofertaIds } : { ofertaId: -1 };

  const [
    totalPostulaciones,
    candidatosEnRevision,
    candidatosPreseleccionados,
    entrevistasPendientes,
    contrataciones,
    miembrosEquipo,
    reclutadoresActivos,
    solicitudesPendientes,
    conteoPorOferta,
  ] = await Promise.all([
    Postulacion.count({ where: wherePost }),
    Postulacion.count({ where: { ...wherePost, estado: 'en_revision' } }),
    Postulacion.count({ where: { ...wherePost, estado: 'preseleccionado' } }),
    Postulacion.count({ where: { ...wherePost, estado: 'entrevista' } }),
    Postulacion.count({ where: { ...wherePost, estado: 'contratado' } }),
    EmpresaUsuario.count({ where: { empresaId, activo: true } }),
    EmpresaUsuario.count({ where: { empresaId, activo: true, rolInterno: 'reclutador' } }),
    SolicitudReclutador.count({ where: { empresaId, estado: 'pendiente' } }),
    contarPostulacionesPorOferta(ofertaIds),
  ]);

  const ofertasRecientes = await Oferta.findAll({
    where: { empresaId },
    attributes: ['id', 'titulo', 'area', 'estado', 'estadoModeracion', 'vistas', 'createdAt',
                 'cantidadVacantes', 'creadaPorUsuarioId'],
    include: [{ model: Usuario, as: 'creadaPor', attributes: ATRIBUTOS_RESPONSABLE }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: 5,
  });

  // Top global (no depende de ninguna paginación): ofertas con al menos una
  // postulación, ordenadas por cantidad (desempate: la más nueva primero).
  const topOfertasPostulaciones = ofertas
    .filter((o) => (conteoPorOferta[o.id] || 0) > 0)
    .sort((a, b) => (conteoPorOferta[b.id] - conteoPorOferta[a.id]) || (b.id - a.id))
    .slice(0, 5)
    .map((o) => ({
      id: o.id,
      titulo: o.titulo,
      estado: o.estado,
      totalPostulaciones: conteoPorOferta[o.id],
      creadaPor: o.creadaPor ? o.creadaPor.toJSON() : null,
    }));

  return {
    ofertas: {
      activas: ofertasActivas,
      pausadas: ofertasPausadas,
      cerradas: ofertasCerradas,
      pendienteModeracion: ofertasPendienteModeracion,
      total: ofertas.length,
    },
    postulaciones: {
      total: totalPostulaciones,
      enRevision: candidatosEnRevision,
      preseleccionados: candidatosPreseleccionados,
      entrevistas: entrevistasPendientes,
      contrataciones,
    },
    equipo: {
      totalMiembros: miembrosEquipo,
      reclutadoresActivos,
      solicitudesPendientes,
    },
    ofertasRecientes: ofertasRecientes.map((o) => ({
      ...o.toJSON(),
      totalPostulaciones: conteoPorOferta[o.id] || 0,
    })),
    topOfertasPostulaciones,
  };
}

const ESTADOS_OFERTA = ['activa', 'pausada', 'cerrada'];
const ESTADOS_MODERACION = ['pendiente', 'aprobada', 'rechazada', 'auto_aprobada'];
const escaparLike = (texto) => texto.replace(/[\\%_]/g, '\\$&');

/**
 * Filtro por responsable de la oferta: id de usuario, o 'sin' para las ofertas
 * históricas sin responsable registrado. Devuelve null si no hay filtro válido.
 */
function whereResponsable(responsable) {
  if (responsable == null || responsable === '') return null;
  if (responsable === 'sin') return { creadaPorUsuarioId: null };
  const id = Number(responsable);
  return Number.isInteger(id) && id > 0 ? { creadaPorUsuarioId: id } : null;
}

/**
 * Ofertas de la empresa con su total de postulaciones (GET /api/empresas/mis-ofertas).
 *
 * Todos los filtros se aplican en el servidor ANTES de paginar, así el total
 * y las páginas corresponden al resultado filtrado:
 *   - estado: activa | pausada | cerrada
 *   - estadoModeracion: pendiente | aprobada | rechazada | auto_aprobada
 *   - responsable: id del usuario creador, o 'sin'
 *   - q: texto en título, área o nombre/apellido del responsable
 * Valores inválidos se ignoran (no filtran).
 */
async function obtenerOfertasConConteo(empresaId, {
  estado, estadoModeracion, responsable, q, page = 1, limit = 20, offset = 0,
} = {}) {
  const where = { empresaId };
  if (ESTADOS_OFERTA.includes(estado)) where.estado = estado;
  if (ESTADOS_MODERACION.includes(estadoModeracion)) where.estadoModeracion = estadoModeracion;
  Object.assign(where, whereResponsable(responsable) || {});

  const texto = typeof q === 'string' ? q.trim().slice(0, 100) : '';
  if (texto) {
    const patron = `%${escaparLike(texto)}%`;
    where[Op.or] = [
      { titulo: { [Op.iLike]: patron } },
      { area: { [Op.iLike]: patron } },
      { '$creadaPor.nombre$': { [Op.iLike]: patron } },
      { '$creadaPor.apellido$': { [Op.iLike]: patron } },
    ];
  }

  const { count, rows: ofertas } = await Oferta.findAndCountAll({
    where,
    attributes: ['id', 'titulo', 'modalidad', 'ciudad', 'estado', 'estadoModeracion',
                 'cantidadVacantes', 'fechaLimite', 'area', 'createdAt', 'creadaPorUsuarioId'],
    // Responsable de la oferta (RBAC-01): null en ofertas históricas anteriores
    // a la migración 013 — el frontend debe mostrar "Responsable no registrado".
    include: [{ model: Usuario, as: 'creadaPor', attributes: ['id', 'nombre', 'apellido', 'fotoPerfil'] }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
    subQuery: false, // el filtro `q` referencia columnas del include (belongsTo)
  });

  const pagination = buildPagination(count, { page, limit });
  if (ofertas.length === 0) return { data: [], pagination };

  const conteoMap = await contarPostulacionesPorOferta(ofertas.map((o) => o.id));
  const data = ofertas.map((o) => ({ ...o.toJSON(), totalPostulaciones: conteoMap[o.id] || 0 }));
  return { data, pagination };
}

/**
 * Candidatos (postulaciones) de todas las ofertas de la empresa
 * (GET /api/empresas/candidatos). Vista de supervisión: cada fila incluye la
 * oferta y su reclutador responsable.
 *
 * Filtros server-side, antes de paginar: `estado`, `responsable` (id | 'sin')
 * y `ofertaId`. `conteoPorEstado` se calcula sobre el alcance filtrado por
 * responsable/oferta (sin el filtro de estado), así los contadores de las
 * pestañas de estado corresponden a lo que se está mirando.
 */
async function obtenerCandidatosConFoto(empresaId, {
  estado, responsable, ofertaId, page = 1, limit = 20, offset = 0,
} = {}) {
  const whereOfertas = { empresaId, ...(whereResponsable(responsable) || {}) };
  const idOferta = Number(ofertaId);
  if (Number.isInteger(idOferta) && idOferta > 0) whereOfertas.id = idOferta;

  const ofertas = await Oferta.findAll({ where: whereOfertas, attributes: ['id'] });
  const ofertaIds = ofertas.map((o) => o.id);

  const vacio = { data: [], pagination: buildPagination(0, { page, limit }), conteoPorEstado: {} };
  if (ofertaIds.length === 0) return vacio;

  const scope = { ofertaId: { [Op.in]: ofertaIds } };
  const where = estado ? { ...scope, estado } : scope;

  const [{ count, rows: postulaciones }, conteoPorEstado] = await Promise.all([
    Postulacion.findAndCountAll({
      where,
      include: [
        { model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'apellido', 'email', 'fotoPerfil'] },
        {
          model: Oferta,
          as: 'oferta',
          attributes: ['id', 'titulo', 'area', 'creadaPorUsuarioId'],
          include: [{ model: Usuario, as: 'creadaPor', attributes: ATRIBUTOS_RESPONSABLE }],
        },
      ],
      order: [['updatedAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
      distinct: true,
    }),
    groupCount(Postulacion, 'estado', scope),
  ]);

  const usuariosSinFoto = [...new Set(
    postulaciones.filter((p) => p.usuario?.id && !p.usuario.fotoPerfil).map((p) => p.usuario.id)
  )];

  const fotoMap = {};
  if (usuariosSinFoto.length > 0) {
    const perfiles = await Perfil.findAll({
      where: { usuarioId: { [Op.in]: usuariosSinFoto }, fotoPerfil: { [Op.ne]: null } },
      attributes: ['usuarioId', 'fotoPerfil'],
    });
    perfiles.forEach((p) => { fotoMap[p.usuarioId] = p.fotoPerfil; });
  }

  const data = postulaciones.map((p) => {
    const plain = p.toJSON();
    if (plain.usuario && !plain.usuario.fotoPerfil) {
      plain.usuario.fotoPerfil = fotoMap[plain.usuario.id] ?? null;
    }
    return plain;
  });

  return { data, pagination: buildPagination(count, { page, limit }), conteoPorEstado };
}

const esIdValido = (valor) => (typeof valor === 'number' || (typeof valor === 'string' && /^\d+$/.test(valor)))
  && Number.isInteger(Number(valor)) && Number(valor) > 0;

/**
 * Asigna (o cambia) el reclutador responsable de una oferta de la empresa
 * (PATCH /api/empresas/ofertas/:id/responsable — solo admin_empresa).
 *
 * Es una acción de GOBIERNO: solo toca `creadaPorUsuarioId`. No modifica el
 * contenido de la oferta, ni las postulaciones, ni sus estados.
 *
 * El responsable tiene que ser un RECLUTADOR ACTIVO de ESA empresa (membresía
 * activa con rolInterno 'reclutador' y cuenta de usuario activa y habilitada):
 * nunca el admin_empresa, un reclutador suspendido o alguien de otra empresa.
 *
 * @returns {{ oferta, responsable, anterior, anteriorVigente }}
 *   anterior: usuario que figuraba como responsable (o null) — para auditoría.
 *   anteriorVigente: ese mismo usuario solo si seguía siendo un reclutador
 *   activo de la empresa (a quién tiene sentido avisarle).
 */
async function asignarResponsableOferta(empresa, ofertaId, responsableId) {
  if (!esIdValido(ofertaId)) throw new HttpError(404, 'Oferta no encontrada.');
  if (!esIdValido(responsableId)) {
    throw new HttpError(400, 'Indicá el reclutador responsable (responsableId).');
  }
  const idResponsable = Number(responsableId);

  const oferta = await Oferta.findOne({ where: { id: Number(ofertaId), empresaId: empresa.id } });
  if (!oferta) throw new HttpError(404, 'Oferta no encontrada.');

  const membresia = await EmpresaUsuario.findOne({
    where: { empresaId: empresa.id, usuarioId: idResponsable, rolInterno: 'reclutador', activo: true },
    include: [{ model: Usuario, as: 'usuario', attributes: [...ATRIBUTOS_RESPONSABLE, 'activo', 'habilitado'] }],
  });
  const candidato = membresia?.usuario;
  if (!candidato || !candidato.activo || !candidato.habilitado) {
    throw new HttpError(400, 'El responsable debe ser un reclutador activo de tu empresa.');
  }

  if (oferta.creadaPorUsuarioId === idResponsable) {
    throw new HttpError(400, 'Ese reclutador ya es el responsable de la oferta.');
  }

  const [anterior, anteriorVigente] = await Promise.all([
    oferta.creadaPorUsuarioId
      ? Usuario.findByPk(oferta.creadaPorUsuarioId, { attributes: ATRIBUTOS_RESPONSABLE })
      : null,
    obtenerReclutadorResponsable(oferta),
  ]);

  await oferta.update({ creadaPorUsuarioId: idResponsable });

  const responsable = { id: candidato.id, nombre: candidato.nombre, apellido: candidato.apellido };
  return { oferta, responsable, anterior, anteriorVigente };
}

/**
 * Ficha de un reclutador (GET /api/empresas/reclutadores/:id/perfil).
 *
 * Solo datos de contacto básicos de una persona que es RECLUTADOR ACTIVO de
 * una empresa. Un admin_empresa no tiene ficha personal: se lo representa con
 * el perfil de la empresa.
 *
 * Quién puede verla (no es un directorio abierto de reclutadores):
 *   - el propio reclutador;
 *   - cualquier miembro activo de su misma empresa;
 *   - un alumno/egresado que pueda ver la conversación con él (misma regla
 *     del chat: una postulación suya avanzó bajo su responsabilidad);
 *   - el admin del sistema.
 *
 * Devuelve null tanto si el usuario no existe o no es un reclutador activo
 * como si quien consulta no tiene relación: el controller responde el mismo
 * 404 en los dos casos, para no permitir enumerar reclutadores por id.
 */
async function obtenerPerfilReclutador(solicitante, usuarioId) {
  if (!esIdValido(usuarioId)) return null;
  const id = Number(usuarioId);

  const membresia = await EmpresaUsuario.findOne({
    where: { usuarioId: id, rolInterno: 'reclutador', activo: true },
    include: [
      {
        model: Usuario,
        as: 'usuario',
        attributes: ['id', 'nombre', 'apellido', 'email', 'telefono', 'ubicacion', 'fotoPerfil', 'rol', 'activo'],
      },
      { model: Empresa, as: 'empresa', attributes: ['id', 'razonSocial', 'logo'] },
    ],
  });
  const usuario = membresia?.usuario;
  if (!usuario || usuario.rol !== 'empresa' || !usuario.activo || !membresia.empresa) return null;

  let autorizado = false;
  if (solicitante.rol === 'admin' || solicitante.id === id) autorizado = true;
  else if (solicitante.rol === 'empresa') autorizado = await comparteMismaEmpresa(solicitante.id, id);
  else if (['alumno', 'egresado'].includes(solicitante.rol)) {
    autorizado = (await puedeVerConversacion(solicitante.id, id)).ok;
  }
  if (!autorizado) return null;

  let fotoPerfil = usuario.fotoPerfil;
  if (!fotoPerfil) {
    const perfil = await Perfil.findOne({ where: { usuarioId: id }, attributes: ['fotoPerfil'] });
    fotoPerfil = perfil?.fotoPerfil ?? null;
  }

  return {
    id: usuario.id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    email: usuario.email,
    telefono: usuario.telefono ?? null,
    ubicacion: usuario.ubicacion ?? null,
    fotoPerfil,
    empresa: {
      id: membresia.empresa.id,
      razonSocial: membresia.empresa.razonSocial,
      logo: membresia.empresa.logo ?? null,
    },
  };
}

module.exports = {
  asignarResponsableOferta,
  obtenerPerfilReclutador,
  resolverEmpresaDelRequest,
  obtenerAdminsActivos,
  obtenerReclutadorResponsable,
  obtenerDestinatariosPostulacion,
  obtenerMetricasDashboard,
  obtenerOfertasConConteo,
  obtenerCandidatosConFoto,
};
