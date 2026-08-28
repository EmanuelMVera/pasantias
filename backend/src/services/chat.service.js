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
 * Resuelve razonSocial y empresaId de un único usuario con rol 'empresa'.
 * 1. Busca membresía activa en empresa_usuarios
 * 2. Fallback: propietario directo (empresa.usuarioId)
 */
async function resolverEmpresaData(usuarioId) {
  const membresia = await EmpresaUsuario.findOne({
    where: { usuarioId, activo: true },
    attributes: [],
    include: [{ model: Empresa, as: 'empresa', attributes: ['id', 'razonSocial'] }],
  });
  if (membresia?.empresa?.razonSocial) {
    return { razonSocial: membresia.empresa.razonSocial, empresaId: membresia.empresa.id };
  }
  const empresa = await Empresa.findOne({ where: { usuarioId }, attributes: ['id', 'razonSocial'] });
  return empresa
    ? { razonSocial: empresa.razonSocial, empresaId: empresa.id }
    : { razonSocial: null, empresaId: null };
}

/**
 * Batch lookup de razonSocial + empresaId para múltiples usuarios empresa.
 * @returns {Object} map { usuarioId: { razonSocial, empresaId } }
 */
async function resolverEmpresasBatch(usuarioIds) {
  if (!usuarioIds?.length) return {};
  const [membresias, directas] = await Promise.all([
    EmpresaUsuario.findAll({
      where: { usuarioId: { [Op.in]: usuarioIds }, activo: true },
      attributes: ['usuarioId'],
      include: [{ model: Empresa, as: 'empresa', attributes: ['id', 'razonSocial'] }],
    }),
    Empresa.findAll({
      where: { usuarioId: { [Op.in]: usuarioIds } },
      attributes: ['id', 'usuarioId', 'razonSocial'],
    }),
  ]);
  const map = {};
  directas.forEach((e) => { map[e.usuarioId] = { razonSocial: e.razonSocial, empresaId: e.id }; });
  membresias.forEach((m) => {
    if (m.empresa?.razonSocial) map[m.usuarioId] = { razonSocial: m.empresa.razonSocial, empresaId: m.empresa.id };
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

  const data = resultados.map((u) => ({ ...u.toJSON(), razonSocial: null, empresaId: null }));

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
      u.empresaId   = rsMap[u.id]?.empresaId   ?? null;
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
      c.usuario.empresaId   = empresaMap[c.usuario.id]?.empresaId   ?? null;
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
    const { razonSocial, empresaId } = await resolverEmpresaData(partnerId);
    partnerData.razonSocial = razonSocial;
    partnerData.empresaId   = empresaId;
  } else {
    partnerData.razonSocial = null;
    partnerData.empresaId   = null;
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
