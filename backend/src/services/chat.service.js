'use strict';

const { Mensaje, Usuario, Empresa, EmpresaUsuario, Perfil, Postulacion, Oferta } = require('../models');
const { Op } = require('sequelize');
const { resolverMembresiasActivas, puedeVerConversacion } = require('./chatPermission.service');
const { buildPagination } = require('../utils/pagination');

// Estados de Postulacion que habilitan chat nuevo (ver chatPermission.service.js).
// 'rechazado' queda afuera a propósito: un candidato rechazado puede seguir
// apareciendo en la lista de conversaciones si ya hay historial, pero no
// como resultado de búsqueda de "nuevo chat" (ver reglas de negocio).
const ESTADOS_CHAT_ENVIO = ['preseleccionado', 'entrevista', 'contratado'];

// ── Helpers de datos ──────────────────────────────────────────────────────────

/**
 * Batch lookup de fotoPerfil desde la tabla perfiles.
 * Fallback para usuarios cuyo campo fotoPerfil en la tabla usuarios está vacío.
 * @returns {Object} map { usuarioId: fotoPerfil }
 */
async function resolverFotoPerfilBatch(usuarioIds) {
  if (!usuarioIds?.length) return {};
  const perfiles = await Perfil.findAll({
    where: { usuarioId: { [Op.in]: usuarioIds }, fotoPerfil: { [Op.ne]: null } },
    attributes: ['usuarioId', 'fotoPerfil'],
  });
  const map = {};
  perfiles.forEach((p) => { map[p.usuarioId] = p.fotoPerfil; });
  return map;
}

/**
 * Resuelve razonSocial, logo, empresaId y rolInterno de un único usuario con
 * rol 'empresa'. rolInterno decide la identidad visual en el frontend
 * (admin_empresa → institucional; reclutador → persona) — ver Navbar.jsx.
 * RBAC-06: exclusivamente vía membresía activa en empresa_usuarios.
 */
async function resolverEmpresaData(usuarioId) {
  const membresia = await EmpresaUsuario.findOne({
    where: { usuarioId, activo: true },
    attributes: ['rolInterno'],
    include: [{ model: Empresa, as: 'empresa', attributes: ['id', 'razonSocial', 'logo'] }],
  });
  if (membresia?.empresa?.razonSocial) {
    return {
      razonSocial: membresia.empresa.razonSocial,
      logo: membresia.empresa.logo,
      empresaId: membresia.empresa.id,
      rolInterno: membresia.rolInterno,
    };
  }
  return { razonSocial: null, logo: null, empresaId: null, rolInterno: null };
}

/**
 * Batch lookup de razonSocial + logo + empresaId + rolInterno para múltiples
 * usuarios empresa. RBAC-06: exclusivamente vía empresa_usuarios.
 * @returns {Object} map { usuarioId: { razonSocial, logo, empresaId, rolInterno } }
 */
async function resolverEmpresasBatch(usuarioIds) {
  if (!usuarioIds?.length) return {};
  const membresias = await EmpresaUsuario.findAll({
    where: { usuarioId: { [Op.in]: usuarioIds }, activo: true },
    attributes: ['usuarioId', 'rolInterno'],
    include: [{ model: Empresa, as: 'empresa', attributes: ['id', 'razonSocial', 'logo'] }],
  });
  const map = {};
  membresias.forEach((m) => {
    if (m.empresa?.razonSocial) {
      map[m.usuarioId] = {
        razonSocial: m.empresa.razonSocial, logo: m.empresa.logo,
        empresaId: m.empresa.id, rolInterno: m.rolInterno,
      };
    }
  });
  return map;
}

// ── Búsqueda de usuarios ──────────────────────────────────────────────────────

/**
 * Busca usuarios con los que el solicitante puede iniciar un chat NUEVO.
 * Ya no es un buscador global: refleja exactamente con quién puedeEnviarMensaje
 * habilitaría una conversación (ver chatPermission.service.js).
 *   - alumno/egresado: solo reclutadores con una Postulacion propia en estado
 *     habilitante (preseleccionado/entrevista/contratado). Nunca otros
 *     alumnos, nunca admin_empresa, nunca empresas ajenas.
 *   - empresa (admin_empresa): solo compañeros activos de su propia empresa.
 *   - empresa (reclutador): compañeros de equipo + candidatos de ofertas bajo
 *     su responsabilidad (creadaPorUsuarioId propio) en estado habilitante.
 *     Una oferta sin responsable no habilita chat con ningún reclutador.
 *   - admin: ya filtrado antes de llegar acá (chat.controller.js).
 * @returns {Array} usuarios con fotoPerfil y razonSocial resueltos
 */
async function buscarUsuarios(userId, rol, q) {
  const filtroTexto = {
    [Op.or]: [
      { nombre:   { [Op.iLike]: `%${q}%` } },
      { apellido: { [Op.iLike]: `%${q}%` } },
      { email:    { [Op.iLike]: `%${q}%` } },
    ],
  };

  let resultados = [];

  if (['alumno', 'egresado'].includes(rol)) {
    const postulaciones = await Postulacion.findAll({
      where: { usuarioId: userId, estado: { [Op.in]: ESTADOS_CHAT_ENVIO } },
      attributes: ['id'],
      include: [{ model: Oferta, as: 'oferta', attributes: ['empresaId', 'creadaPorUsuarioId'] }],
    });

    const empresaIds = new Set(postulaciones.map((p) => p.oferta?.empresaId).filter(Boolean));
    const reclutadorIds = new Set();

    if (empresaIds.size > 0) {
      const reclutadoresActivos = await EmpresaUsuario.findAll({
        where: { empresaId: { [Op.in]: [...empresaIds] }, activo: true, rolInterno: 'reclutador' },
        attributes: ['usuarioId', 'empresaId'],
      });
      const activosPorEmpresa = new Map();
      reclutadoresActivos.forEach((r) => {
        if (!activosPorEmpresa.has(r.empresaId)) activosPorEmpresa.set(r.empresaId, new Set());
        activosPorEmpresa.get(r.empresaId).add(r.usuarioId);
      });

      postulaciones.forEach((p) => {
        const oferta = p.oferta;
        if (!oferta) return;
        const activos = activosPorEmpresa.get(oferta.empresaId) ?? new Set();
        if (oferta.creadaPorUsuarioId && activos.has(oferta.creadaPorUsuarioId)) {
          reclutadorIds.add(oferta.creadaPorUsuarioId);
        }
      });
    }

    if (reclutadorIds.size > 0) {
      resultados = await Usuario.findAll({
        where: { id: { [Op.in]: [...reclutadorIds] }, activo: true, ...filtroTexto },
        attributes: ['id', 'nombre', 'apellido', 'email', 'rol', 'fotoPerfil'],
        limit: 20,
        order: [['nombre', 'ASC'], ['apellido', 'ASC']],
      });
    }
  } else if (rol === 'empresa') {
    const membresias = await resolverMembresiasActivas(userId);
    const empresaIds = membresias.map((m) => m.empresaId);

    const companeroIds = new Set();
    if (empresaIds.length > 0) {
      const miembros = await EmpresaUsuario.findAll({
        where: { empresaId: { [Op.in]: empresaIds }, activo: true }, attributes: ['usuarioId'],
      });
      miembros.forEach((m) => companeroIds.add(m.usuarioId));
      companeroIds.delete(userId);
    }

    const empresaIdsComoReclutador = membresias
      .filter((m) => m.rolInterno === 'reclutador')
      .map((m) => m.empresaId);

    const candidatoIds = new Set();
    if (empresaIdsComoReclutador.length > 0) {
      const postulacionesCandidatos = await Postulacion.findAll({
        where: { estado: { [Op.in]: ESTADOS_CHAT_ENVIO } },
        attributes: ['usuarioId'],
        include: [{
          model: Oferta, as: 'oferta', attributes: [], required: true,
          where: {
            empresaId: { [Op.in]: empresaIdsComoReclutador },
            creadaPorUsuarioId: userId,
          },
        }],
      });
      postulacionesCandidatos.forEach((p) => candidatoIds.add(p.usuarioId));
    }

    let companeros = [];
    if (companeroIds.size > 0) {
      companeros = await Usuario.findAll({
        where: { id: { [Op.in]: [...companeroIds] }, activo: true, ...filtroTexto },
        attributes: ['id', 'nombre', 'apellido', 'email', 'rol', 'fotoPerfil'],
        limit: 20,
        order: [['nombre', 'ASC'], ['apellido', 'ASC']],
      });
    }

    let candidatos = [];
    if (candidatoIds.size > 0) {
      candidatos = await Usuario.findAll({
        where: { id: { [Op.in]: [...candidatoIds] }, activo: true, ...filtroTexto },
        attributes: ['id', 'nombre', 'apellido', 'email', 'rol', 'fotoPerfil'],
        limit: 20,
        order: [['nombre', 'ASC'], ['apellido', 'ASC']],
      });
    }

    const vistos = new Set(companeros.map((u) => u.id));
    resultados = [...companeros, ...candidatos.filter((u) => !vistos.has(u.id))].slice(0, 20);
  }

  const data = resultados.map((u) => ({ ...u.toJSON(), razonSocial: null, logo: null, empresaId: null, rolInterno: null }));

  const sinFoto = data.filter((u) => !u.fotoPerfil).map((u) => u.id);
  if (sinFoto.length > 0) {
    const fotoMap = await resolverFotoPerfilBatch(sinFoto);
    data.forEach((u) => { if (!u.fotoPerfil) u.fotoPerfil = fotoMap[u.id] ?? null; });
  }

  const empresaUserIds = data.filter((u) => u.rol === 'empresa').map((u) => u.id);
  if (empresaUserIds.length > 0) {
    const rsMap = await resolverEmpresasBatch(empresaUserIds);
    data.forEach((u) => {
      u.razonSocial = rsMap[u.id]?.razonSocial ?? null;
      u.logo        = rsMap[u.id]?.logo        ?? null;
      u.empresaId   = rsMap[u.id]?.empresaId   ?? null;
      u.rolInterno  = rsMap[u.id]?.rolInterno  ?? null;
    });
  }

  return data;
}

// ── Conversaciones ────────────────────────────────────────────────────────────

/**
 * Devuelve la lista de conversaciones del usuario, con último mensaje,
 * conteo de no leídos y datos del interlocutor (foto + razonSocial resueltos).
 */
async function obtenerConversaciones(userId) {
  const mensajes = await Mensaje.findAll({
    where: { [Op.or]: [{ emisorId: userId }, { receptorId: userId }] },
    include: [
      { model: Usuario, as: 'emisor',   attributes: ['id', 'nombre', 'apellido', 'fotoPerfil', 'rol'] },
      { model: Usuario, as: 'receptor', attributes: ['id', 'nombre', 'apellido', 'fotoPerfil', 'rol'] },
    ],
    order: [['createdAt', 'DESC']],
    limit: 200,
  });

  const mapa = new Map();
  for (const m of mensajes) {
    const partnerId = m.emisorId === userId ? m.receptorId : m.emisorId;
    if (!mapa.has(partnerId)) {
      const partner = m.emisorId === userId ? m.receptor : m.emisor;
      mapa.set(partnerId, { usuario: partner, ultimoMensaje: m, noLeidos: 0 });
    }
    if (m.receptorId === userId && !m.leido) {
      mapa.get(partnerId).noLeidos++;
    }
  }

  let conversaciones = Array.from(mapa.values()).map((c) => ({
    usuario: c.usuario?.toJSON ? c.usuario.toJSON() : { ...c.usuario },
    ultimoMensaje: c.ultimoMensaje,
    noLeidos: c.noLeidos,
  }));

  // Recalcula el permiso vigente para cada interlocutor: pares que las reglas
  // actuales ya no habilitan (ej. mensajes legacy alumno↔alumno) desaparecen
  // de la lista; los que siguen habilitados solo para lectura (candidato
  // rechazado) quedan marcados con soloLectura.
  const permisos = await Promise.all(
    conversaciones.map((c) => puedeVerConversacion(userId, c.usuario.id))
  );
  conversaciones = conversaciones
    .map((c, i) => ({ ...c, soloLectura: permisos[i].soloLectura }))
    .filter((_, i) => permisos[i].ok);

  const empresaUserIds = conversaciones
    .filter((c) => c.usuario.rol === 'empresa')
    .map((c) => c.usuario.id);

  if (empresaUserIds.length > 0) {
    const empresaMap = await resolverEmpresasBatch(empresaUserIds);
    conversaciones.forEach((c) => {
      c.usuario.razonSocial = empresaMap[c.usuario.id]?.razonSocial ?? null;
      c.usuario.logo        = empresaMap[c.usuario.id]?.logo        ?? null;
      c.usuario.empresaId   = empresaMap[c.usuario.id]?.empresaId   ?? null;
      c.usuario.rolInterno  = empresaMap[c.usuario.id]?.rolInterno  ?? null;
    });
  }

  const sinFoto = conversaciones.filter((c) => !c.usuario.fotoPerfil).map((c) => c.usuario.id);
  if (sinFoto.length > 0) {
    const fotoMap = await resolverFotoPerfilBatch(sinFoto);
    conversaciones.forEach((c) => {
      if (!c.usuario.fotoPerfil) c.usuario.fotoPerfil = fotoMap[c.usuario.id] ?? null;
    });
  }

  return conversaciones;
}

// ── Historial ─────────────────────────────────────────────────────────────────

/**
 * Obtiene el historial paginado de mensajes entre dos usuarios.
 * Resuelve datos del interlocutor (foto, razonSocial) y marca como leídos los
 * mensajes recibidos no leídos.
 *
 * `data` va en orden cronológico (más viejo primero) DENTRO de la página; la
 * página 1 es la de los mensajes más nuevos, la 2 los siguientes más viejos,
 * etc. — el frontend hace prepend al scrollear hacia arriba (SCALE-03).
 * @returns {{ usuario, data, pagination }}
 */
async function obtenerHistorial(userId, partnerId, { page = 1, limit = 50, offset = 0 } = {}) {
  const partner = await Usuario.findOne({
    where: { id: partnerId },
    attributes: ['id', 'nombre', 'apellido', 'fotoPerfil', 'rol', 'ultimoAcceso'],
  });
  if (!partner) return null;

  const partnerData = partner.toJSON();
  if (partner.rol === 'empresa') {
    const { razonSocial, logo, empresaId, rolInterno } = await resolverEmpresaData(partnerId);
    partnerData.razonSocial = razonSocial;
    partnerData.logo        = logo;
    partnerData.empresaId   = empresaId;
    partnerData.rolInterno  = rolInterno;
  } else {
    partnerData.razonSocial = null;
    partnerData.logo        = null;
    partnerData.empresaId   = null;
    partnerData.rolInterno  = null;
  }

  if (!partnerData.fotoPerfil) {
    const perfilFoto = await Perfil.findOne({ where: { usuarioId: partnerId }, attributes: ['fotoPerfil'] });
    partnerData.fotoPerfil = perfilFoto?.fotoPerfil ?? null;
  }

  const { count, rows: mensajes } = await Mensaje.findAndCountAll({
    where: {
      [Op.or]: [
        { emisorId: userId, receptorId: partnerId },
        { emisorId: partnerId, receptorId: userId },
      ],
    },
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });

  await Mensaje.update(
    { leido: true },
    { where: { emisorId: partnerId, receptorId: userId, leido: false } }
  );

  return {
    usuario: partnerData,
    data: mensajes.reverse(),
    pagination: buildPagination(count, { page, limit }),
  };
}

// ── Notificaciones anti-spam ──────────────────────────────────────────────────

/**
 * Devuelve true si se debe enviar notificación al receptor.
 * Solo notifica cuando no hay mensajes previos sin leer del mismo emisor
 * (evita flood de emails por cada burbuja del chat).
 */
async function debeNotificarMensaje(emisorId, receptorId, nuevoMensajeId) {
  const previosSinLeer = await Mensaje.count({
    where: {
      emisorId,
      receptorId,
      leido: false,
      id: { [Op.lt]: nuevoMensajeId },
    },
  });
  return previosSinLeer === 0;
}

module.exports = {
  resolverFotoPerfilBatch,
  resolverEmpresaData,
  resolverEmpresasBatch,
  buscarUsuarios,
  obtenerConversaciones,
  obtenerHistorial,
  debeNotificarMensaje,
};
