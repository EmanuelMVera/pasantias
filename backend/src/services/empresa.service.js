'use strict';

const { Oferta, Postulacion, Perfil, Usuario, Empresa, EmpresaUsuario, sequelize } = require('../models');
const { Op } = require('sequelize');
const { buildPagination, groupCount } = require('../utils/pagination');

// Resolución canónica de empresa para un request autenticado.
// Orden: (1) req.empresa inyectado por middleware → (2) membresía activa en
// empresa_usuarios (cubre reclutador y admin_empresa) → (3) fallback legacy
// por Empresa.usuarioId para cuentas creadas antes de la feature multi-usuario.
async function resolverEmpresaDelRequest(req) {
  if (req.empresa) return req.empresa;

  const membresia = await EmpresaUsuario.findOne({
    where: { usuarioId: req.usuario.id, activo: true },
    include: [{ model: Empresa, as: 'empresa' }],
  });
  if (membresia?.empresa) return membresia.empresa;

  return Empresa.findOne({ where: { usuarioId: req.usuario.id } });
}

async function obtenerMetricasDashboard(empresaId) {
  const ofertas = await Oferta.findAll({
    where: { empresaId },
    attributes: ['id', 'estado', 'moderada'],
  });
  const ofertaIds = ofertas.map((o) => o.id);

  const ofertasActivas             = ofertas.filter((o) => o.estado === 'activa').length;
  const ofertasPausadas            = ofertas.filter((o) => o.estado === 'pausada').length;
  const ofertasCerradas            = ofertas.filter((o) => o.estado === 'cerrada').length;
  const ofertasPendienteModeracion = ofertas.filter((o) => !o.moderada && o.estado === 'activa').length;

  const wherePost = ofertaIds.length > 0 ? { ofertaId: ofertaIds } : { ofertaId: -1 };

  const [
    totalPostulaciones,
    candidatosEnRevision,
    candidatosPreseleccionados,
    entrevistasPendientes,
    contrataciones,
    miembrosEquipo,
  ] = await Promise.all([
    Postulacion.count({ where: wherePost }),
    Postulacion.count({ where: { ...wherePost, estado: 'en_revision' } }),
    Postulacion.count({ where: { ...wherePost, estado: 'preseleccionado' } }),
    Postulacion.count({ where: { ...wherePost, estado: 'entrevista' } }),
    Postulacion.count({ where: { ...wherePost, estado: 'contratado' } }),
    EmpresaUsuario.count({ where: { empresaId, activo: true } }),
  ]);

  const ofertasRecientes = await Oferta.findAll({
    where: { empresaId },
    attributes: ['id', 'titulo', 'estado', 'moderada', 'vistas', 'createdAt', 'cantidadVacantes'],
    order: [['createdAt', 'DESC']],
    limit: 5,
  });

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
    equipo: { totalMiembros: miembrosEquipo },
    ofertasRecientes,
  };
}

// Reemplaza el N+1 de getMisOfertas con una sola query GROUP BY.
// Paginado (SCALE-03): recibe { estado, page, limit, offset } ya saneados.
async function obtenerOfertasConConteo(empresaId, { estado, page = 1, limit = 20, offset = 0 } = {}) {
  const where = { empresaId };
  if (estado) where.estado = estado;

  const { count, rows: ofertas } = await Oferta.findAndCountAll({
    where,
    attributes: ['id', 'titulo', 'modalidad', 'ciudad', 'estado', 'moderada',
                 'cantidadVacantes', 'fechaLimite', 'area', 'createdAt', 'creadaPorUsuarioId'],
    // Responsable de la oferta (RBAC-01): null en ofertas históricas anteriores
    // a la migración 013 — el frontend debe mostrar "Responsable no registrado".
    include: [{ model: Usuario, as: 'creadaPor', attributes: ['id', 'nombre', 'apellido', 'fotoPerfil'] }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });

  const pagination = buildPagination(count, { page, limit });
  if (ofertas.length === 0) return { data: [], pagination };

  const ofertaIds = ofertas.map((o) => o.id);

  const conteos = await Postulacion.findAll({
    where: { ofertaId: { [Op.in]: ofertaIds } },
    attributes: [
      'ofertaId',
      [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
    ],
    group: ['ofertaId'],
    raw: true,
  });

  const conteoMap = {};
  conteos.forEach((c) => { conteoMap[c.ofertaId] = parseInt(c.total, 10); });

  const data = ofertas.map((o) => ({ ...o.toJSON(), totalPostulaciones: conteoMap[o.id] || 0 }));
  return { data, pagination };
}

// Paginado (SCALE-03): recibe { estado, page, limit, offset } ya saneados.
async function obtenerCandidatosConFoto(empresaId, { estado, page = 1, limit = 20, offset = 0 } = {}) {
  const ofertas = await Oferta.findAll({ where: { empresaId }, attributes: ['id'] });
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
        { model: Oferta,  as: 'oferta',  attributes: ['id', 'titulo', 'area'] },
      ],
      order: [['updatedAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
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

module.exports = {
  resolverEmpresaDelRequest,
  obtenerMetricasDashboard,
  obtenerOfertasConConteo,
  obtenerCandidatosConFoto,
};
