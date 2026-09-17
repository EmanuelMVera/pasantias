'use strict';

const { Mensaje, Usuario, Empresa, EmpresaUsuario, Perfil } = require('../models');
const { Op } = require('sequelize');
const { resolverEmpresasDeUsuario } = require('./chatPermission.service');
const { buildPagination } = require('../utils/pagination');

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
 * 1. Busca membresía activa en empresa_usuarios
 * 2. Fallback: propietario directo (empresa.usuarioId) → admin_empresa implícito
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
  const empresa = await Empresa.findOne({ where: { usuarioId }, attributes: ['id', 'razonSocial', 'logo'] });
  return empresa
    ? { razonSocial: empresa.razonSocial, logo: empresa.logo, empresaId: empresa.id, rolInterno: 'admin_empresa' }
    : { razonSocial: null, logo: null, empresaId: null, rolInterno: null };
}

/**
 * Batch lookup de razonSocial + logo + empresaId + rolInterno para múltiples
 * usuarios empresa.
 * @returns {Object} map { usuarioId: { razonSocial, logo, empresaId, rolInterno } }
 */
async function resolverEmpresasBatch(usuarioIds) {
  if (!usuarioIds?.length) return {};
  const [membresias, directas] = await Promise.all([
    EmpresaUsuario.findAll({
      where: { usuarioId: { [Op.in]: usuarioIds }, activo: true },
      attributes: ['usuarioId', 'rolInterno'],
      include: [{ model: Empresa, as: 'empresa', attributes: ['id', 'razonSocial', 'logo'] }],
    }),
    Empresa.findAll({
      where: { usuarioId: { [Op.in]: usuarioIds } },
      attributes: ['id', 'usuarioId', 'razonSocial', 'logo'],
    }),
  ]);
  const map = {};
  directas.forEach((e) => {
    map[e.usuarioId] = { razonSocial: e.razonSocial, logo: e.logo, empresaId: e.id, rolInterno: 'admin_empresa' };
  });
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
 * Busca usuarios con los que el solicitante puede iniciar un chat.
 * Aplica reglas de visibilidad por rol y resuelve foto + razonSocial en batch.
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
    resultados = await Usuario.findAll({
      where: {
        id:     { [Op.ne]: userId },
        activo: true,
        rol:    { [Op.in]: ['alumno', 'egresado', 'empresa'] },
        ...filtroTexto,
      },
      attributes: ['id', 'nombre', 'apellido', 'email', 'rol', 'fotoPerfil'],
      limit: 20,
      order: [['nombre', 'ASC'], ['apellido', 'ASC']],
    });
  } else if (rol === 'empresa') {
    const misEmpresaIds = await resolverEmpresasDeUsuario(userId);

    const alumnos = await Usuario.findAll({
      where: {
        id:     { [Op.ne]: userId },
        activo: true,
        rol:    { [Op.in]: ['alumno', 'egresado'] },
        ...filtroTexto,
      },
      attributes: ['id', 'nombre', 'apellido', 'email', 'rol', 'fotoPerfil'],
      limit: 15,
      order: [['nombre', 'ASC'], ['apellido', 'ASC']],
    });

    let companeros = [];
    if (misEmpresaIds.size > 0) {
      const [directos, miembros] = await Promise.all([
        Empresa.findAll({
          where: { id: { [Op.in]: [...misEmpresaIds] } },
          attributes: ['usuarioId'],
        }),
        EmpresaUsuario.findAll({
          where: { empresaId: { [Op.in]: [...misEmpresaIds] }, activo: true },
          attributes: ['usuarioId'],
        }),
      ]);
      const companeroIds = new Set([
        ...directos.map((e) => e.usuarioId),
        ...miembros.map((m) => m.usuarioId),
      ]);
      companeroIds.delete(userId);

      if (companeroIds.size > 0) {
        companeros = await Usuario.findAll({
          where: { id: { [Op.in]: [...companeroIds] }, activo: true, ...filtroTexto },
          attributes: ['id', 'nombre', 'apellido', 'email', 'rol', 'fotoPerfil'],
          limit: 5,
          order: [['nombre', 'ASC'], ['apellido', 'ASC']],
        });
      }
    }

    const vistos = new Set(companeros.map((u) => u.id));
    resultados = [...companeros, ...alumnos.filter((u) => !vistos.has(u.id))].slice(0, 20);
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

  const conversaciones = Array.from(mapa.values()).map((c) => ({
    usuario: c.usuario?.toJSON ? c.usuario.toJSON() : { ...c.usuario },
    ultimoMensaje: c.ultimoMensaje,
    noLeidos: c.noLeidos,
  }));

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
