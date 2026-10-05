'use strict';

const { Oferta, Empresa, Postulacion, Perfil } = require('../models');
const { Op } = require('sequelize');
const ofertaService   = require('../services/oferta.service');
const empresaService  = require('../services/empresa.service');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { registrarAuditoria } = require('../utils/auditLog');
const { validarOferta } = require('../validators/oferta.validator');

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

// Pública. Con sesión de alumno/egresado (optionalToken) agrega su situación:
//   - miPostulacion: { id, estado, fechaPostulacion } o null → el detalle no
//     vuelve a ofrecer el formulario a quien ya se postuló;
//   - cvCargado: sin CV el backend rechaza la postulación (CV_REQUERIDO), así
//     que el detalle lo avisa antes.
// Una oferta que dejó de estar publicada (pausada, cerrada) sigue visible SOLO
// para quien se postuló: es el contexto de su postulación ("Ver oferta" desde
// Mis postulaciones). Para el resto responde el mismo 404.
exports.getOfertaById = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(404).json({ success: false, message: 'Oferta no encontrada.' });
  }

  const oferta = await Oferta.findByPk(id, {
    include: [{ model: Empresa, as: 'empresa', attributes: ['id', 'razonSocial', 'logo', 'rubro', 'ciudad'] }],
  });

  const esCandidato = ['alumno', 'egresado'].includes(req.usuario?.rol);
  const [miPostulacion, perfil] = oferta && esCandidato
    ? await Promise.all([
      Postulacion.findOne({
        where: { usuarioId: req.usuario.id, ofertaId: id },
        attributes: ['id', 'estado', 'fechaPostulacion', 'createdAt'],
      }),
      Perfil.findOne({ where: { usuarioId: req.usuario.id }, attributes: ['cvPath'] }),
    ])
    : [null, null];

  const visible = oferta && ofertaService.esOfertaVisible(oferta);
  if (!oferta || (!visible && !miPostulacion)) {
    return res.status(404).json({ success: false, message: 'Oferta no encontrada.' });
  }

  if (visible) await oferta.increment('vistas');

  const data = oferta.toJSON();
  if (esCandidato) {
    data.miPostulacion = miPostulacion
      ? {
        id: miPostulacion.id,
        estado: miPostulacion.estado,
        fechaPostulacion: miPostulacion.fechaPostulacion ?? miPostulacion.createdAt,
      }
      : null;
    data.cvCargado = Boolean(perfil?.cvPath);
  }
  return res.json({ success: true, data });
};

// ── Crear oferta ──────────────────────────────────────────────────────────────

exports.createOferta = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(400).json({ success: false, message: 'No tenés empresa registrada.' });

  if (empresa.estadoAprobacion !== 'aprobada') {
    return res.status(403).json({ success: false, message: 'Tu empresa aún no fue aprobada.' });
  }

  // Whitelist validada (oferta.validator.js): solo el contenido editable de la
  // oferta llega a la BD — nunca estado, vistas, moderación ni responsable.
  const { error: errorCampos, datos } = validarOferta(req.body);
  if (errorCampos) return res.status(400).json({ success: false, message: errorCampos });
  const { error, campos } = ofertaService.validarCamposPuesto(datos);
  if (error) return res.status(400).json({ success: false, message: error });

  // RBAC-05: empresas de confianza publican sin moderación previa — la
  // confianza es de la EMPRESA, se resuelve al momento de crear la oferta
  // (revocarla después no re-modera lo ya publicado, ver
  // adminModeracion.service.js::cambiarNivelConfianza).
  const esConfiable = empresa.nivelConfianza === 'confiable';
  const estadoModeracion = esConfiable ? 'auto_aprobada' : 'pendiente';

  const oferta = await Oferta.create({
    ...datos, ...campos, empresaId: empresa.id, estadoModeracion, creadaPorUsuarioId: req.usuario.id,
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
// Solo reclutador (ver oferta.routes.js) y solo el RESPONSABLE de la oferta.
// Una oferta sin responsable no la edita nadie hasta que el admin_empresa le
// asigne uno (ya no existe el fallback "cualquier reclutador").
//
// Editar una oferta RECHAZADA la reenvía a revisión: vuelve a 'pendiente' y se
// avisa al instituto. Vale también para empresas de confianza: la confianza
// habilita la publicación automática de ofertas nuevas, no saltarse la revisión
// de una que el instituto ya rechazó.

exports.updateOferta = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

  const oferta = await Oferta.findOne({ where: { id: req.params.id, empresaId: empresa.id } });
  if (!oferta) return res.status(404).json({ success: false, message: 'Oferta no encontrada.' });

  if (oferta.creadaPorUsuarioId !== req.usuario.id) {
    return res.status(403).json({
      success: false,
      message: 'Solo el reclutador responsable de esta oferta puede editar su contenido.',
      code: 'NO_ES_RESPONSABLE',
    });
  }

  // Whitelist validada: el estado se cambia solo vía PATCH /:id/estado, y ni la
  // moderación ni el responsable ni la empresa se tocan desde el formulario
  // (validarOferta no los incluye en `datos`).
  const { error: errorCampos, datos } = validarOferta(req.body, { parcial: true, actual: oferta });
  if (errorCampos) return res.status(400).json({ success: false, message: errorCampos });
  const { error, campos } = ofertaService.validarCamposPuesto(datos);
  if (error) return res.status(400).json({ success: false, message: error });

  const reenviarARevision = oferta.estadoModeracion === 'rechazada';
  await oferta.update({
    ...datos,
    ...campos,
    ...(reenviarARevision ? { estadoModeracion: 'pendiente' } : {}),
  });

  if (reenviarARevision) {
    ofertaService.notificarAdminsNuevaOferta(oferta, empresa); // fire-and-forget
  }

  return res.json({
    success: true,
    message: reenviarARevision
      ? 'Cambios guardados. La oferta volvió a revisión del instituto.'
      : 'Cambios guardados.',
    data: oferta,
  });
};

// ── Cambiar estado (pausar / reactivar / cerrar) ────────────────────────────────
// reclutador: solo las ofertas a su cargo. admin_empresa: cualquier oferta de
// su empresa (incluidas las que no tienen responsable) — control institucional,
// nunca edita contenido.

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
  const esResponsable = oferta.creadaPorUsuarioId === req.usuario.id;

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
