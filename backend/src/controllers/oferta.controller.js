'use strict';

const { Oferta, Empresa } = require('../models');
const { Op } = require('sequelize');
const ofertaService   = require('../services/oferta.service');
const empresaService  = require('../services/empresa.service');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { registrarAuditoria } = require('../utils/auditLog');

const { TRANSICIONES_ESTADO } = ofertaService;

const ACCION_POR_ESTADO = {
  activa:  'reactivar_oferta',
  pausada: 'pausar_oferta',
  cerrada: 'cerrar_oferta',
};

const _resolverEmpresa = empresaService.resolverEmpresaDelRequest;

// ── Listar ofertas con filtros ────────────────────────────────────────────────

exports.getOfertas = async (req, res) => {
  const { area, modalidad, ciudad, experiencia, tipoPuesto, q } = req.query;
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 12, maxLimit: 48 });

  const where = { ...ofertaService.whereOfertaVisible() };
  if (area)       where.area = { [Op.iLike]: `%${area}%` };
  if (modalidad)  where.modalidad = modalidad;
  if (ciudad)     where.ciudad = { [Op.iLike]: `%${ciudad}%` };
  if (tipoPuesto) where.tipoPuesto = tipoPuesto;
  if (experiencia) where.nivelExperiencia = experiencia;
  if (q)          where.titulo = { [Op.iLike]: `%${q}%` };

  const { count, rows } = await Oferta.findAndCountAll({
    where,
    include: [{ model: Empresa, as: 'empresa', attributes: ['razonSocial', 'logo', 'rubro', 'ciudad'] }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });

  const pagination = buildPagination(count, { page, limit });
  // `total` top-level: alias @deprecated de pagination.total (compat SCALE-03).
  return res.json({ success: true, data: rows, pagination, total: pagination.total });
};

// ── Ofertas recomendadas ──────────────────────────────────────────────────────

exports.getOfertasRecomendadas = async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 12, maxLimit: 20 });

  const resultado = await ofertaService.obtenerRecomendadas(
    req.usuario.id,
    req.usuario,
    { page, limit, offset }
  );

  return res.json({ success: true, ...resultado });
};

// ── Detalle de oferta ─────────────────────────────────────────────────────────

exports.getOfertaById = async (req, res) => {
  const oferta = await Oferta.findOne({
    where: { id: req.params.id, ...ofertaService.whereOfertaVisible() },
    include: [{ model: Empresa, as: 'empresa', attributes: ['id', 'razonSocial', 'logo', 'rubro', 'ciudad'] }],
  });
  if (!oferta) return res.status(404).json({ success: false, message: 'Oferta no encontrada.' });

  await oferta.increment('vistas');
  return res.json({ success: true, data: oferta });
};

// ── Crear oferta ──────────────────────────────────────────────────────────────

exports.createOferta = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(400).json({ success: false, message: 'No tenés empresa registrada.' });

  if (empresa.estadoAprobacion !== 'aprobada') {
    return res.status(403).json({ success: false, message: 'Tu empresa aún no fue aprobada.' });
  }

  const body = ofertaService.sanitizarCamposOpcionales(req.body);
  const { error, campos } = ofertaService.validarCamposPuesto(body);
  if (error) return res.status(400).json({ success: false, message: error });

  // RBAC-05: empresas de confianza publican sin moderación previa — la
  // confianza es de la EMPRESA, se resuelve al momento de crear la oferta
  // (revocarla después no re-modera lo ya publicado, ver
  // adminModeracion.service.js::cambiarNivelConfianza).
  const esConfiable = empresa.nivelConfianza === 'confiable';
  const estadoModeracion = esConfiable ? 'auto_aprobada' : 'pendiente';

  const oferta = await Oferta.create({
    ...body, ...campos, empresaId: empresa.id, estadoModeracion, creadaPorUsuarioId: req.usuario.id,
  });

  if (esConfiable) {
    ofertaService.notificarAdminsOfertaAutoAprobada(oferta, empresa); // fire-and-forget
    registrarAuditoria({
      req,
      accion: 'oferta_auto_aprobada',
      entidad: 'oferta',
      entidadId: oferta.id,
      detalle: { titulo: oferta.titulo, empresaId: empresa.id, razonSocial: empresa.razonSocial },
    });
  } else {
    ofertaService.notificarAdminsNuevaOferta(oferta, empresa); // fire-and-forget
  }

  const mensaje = esConfiable
    ? 'Oferta creada y publicada automáticamente (empresa de confianza).'
    : 'Oferta creada. Pendiente de moderación.';
  return res.status(201).json({ success: true, message: mensaje, data: oferta });
};

// ── Actualizar oferta (contenido) ───────────────────────────────────────────────
// Solo reclutador (ver oferta.routes.js) y solo el creador — o cualquier
// reclutador activo si la oferta es histórica y no tiene creador registrado.

exports.updateOferta = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

  const oferta = await Oferta.findOne({ where: { id: req.params.id, empresaId: empresa.id } });
  if (!oferta) return res.status(404).json({ success: false, message: 'Oferta no encontrada.' });

  if (oferta.creadaPorUsuarioId && oferta.creadaPorUsuarioId !== req.usuario.id) {
    return res.status(403).json({
      success: false,
      message: 'Solo el reclutador responsable de esta oferta puede editar su contenido.',
      code: 'NO_ES_RESPONSABLE',
    });
  }

  const body = ofertaService.sanitizarCamposOpcionales(req.body);
  delete body.estado; // el estado se cambia exclusivamente vía PATCH /:id/estado
  const { error, campos } = ofertaService.validarCamposPuesto(body);
  if (error) return res.status(400).json({ success: false, message: error });

  await oferta.update({ ...body, ...campos });
  return res.json({ success: true, data: oferta });
};

// ── Cambiar estado (pausar / reactivar / cerrar) ────────────────────────────────
// reclutador: solo su propia oferta (o histórica sin creador). admin_empresa:
// cualquier oferta de su empresa — control institucional, nunca edita contenido.

exports.cambiarEstadoOferta = async (req, res) => {
  const { estado } = req.body;
  if (!['activa', 'pausada', 'cerrada'].includes(estado)) {
    return res.status(400).json({ success: false, message: 'estado inválido. Valores permitidos: activa, pausada, cerrada.' });
  }

  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

  const oferta = await Oferta.findOne({ where: { id: req.params.id, empresaId: empresa.id } });
  if (!oferta) return res.status(404).json({ success: false, message: 'Oferta no encontrada.' });

  const rolInterno = req.miembroEmpresa?.rolInterno;
  const esResponsable = !oferta.creadaPorUsuarioId || oferta.creadaPorUsuarioId === req.usuario.id;

  if (rolInterno === 'reclutador' && !esResponsable) {
    return res.status(403).json({
      success: false,
      message: 'Solo el reclutador responsable de esta oferta puede cambiar su estado.',
      code: 'NO_ES_RESPONSABLE',
    });
  }

  const transicionesValidas = TRANSICIONES_ESTADO[oferta.estado] || [];
  if (!transicionesValidas.includes(estado)) {
    return res.status(400).json({
      success: false,
      message: `No se puede pasar de '${oferta.estado}' a '${estado}'.`,
    });
  }

  await oferta.update({ estado });

  await registrarAuditoria({
    req,
    accion: ACCION_POR_ESTADO[estado],
    entidad: 'oferta',
    entidadId: oferta.id,
    detalle: {
      actorRolInterno: rolInterno,
      estadoAnterior: oferta.previous('estado'),
      estadoNuevo: estado,
      esOverrideInstitucional: rolInterno === 'admin_empresa' && !esResponsable,
    },
  });

  return res.json({ success: true, message: 'Estado de la oferta actualizado.', data: oferta });
};
