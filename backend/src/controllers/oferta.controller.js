'use strict';

const { Oferta, Empresa } = require('../models');
const { Op } = require('sequelize');
const ofertaService   = require('../services/oferta.service');
const empresaService  = require('../services/empresa.service');

const _resolverEmpresa = empresaService.resolverEmpresaDelRequest;

// ── Listar ofertas con filtros ────────────────────────────────────────────────

exports.getOfertas = async (req, res) => {
  try {
    const { area, modalidad, ciudad, experiencia, tipoPuesto, q } = req.query;

    const where = { estado: 'activa', moderada: true };
    if (area)       where.area = { [Op.iLike]: `%${area}%` };
    if (modalidad)  where.modalidad = modalidad;
    if (ciudad)     where.ciudad = { [Op.iLike]: `%${ciudad}%` };
    if (tipoPuesto) where.tipoPuesto = tipoPuesto;
    if (experiencia) where.nivelExperiencia = experiencia;
    if (q)          where.titulo = { [Op.iLike]: `%${q}%` };

    const ofertas = await Oferta.findAll({
      where,
      include: [{ model: Empresa, as: 'empresa', attributes: ['razonSocial', 'logo', 'rubro', 'ciudad'] }],
      order: [['createdAt', 'DESC']],
    });

    return res.json({ success: true, total: ofertas.length, data: ofertas });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Error al obtener las ofertas.' });
  }
};

// ── Ofertas recomendadas ──────────────────────────────────────────────────────

exports.getOfertasRecomendadas = async (req, res) => {
  try {
    const limite = Math.min(parseInt(req.query.limit) || 10, 20);
    const pagina = Math.max(parseInt(req.query.page) || 1, 1);

    const resultado = await ofertaService.obtenerRecomendadas(
      req.usuario.id,
      req.usuario,
      { limite, pagina }
    );

    return res.json({ success: true, ...resultado });
  } catch (error) {
    console.error('Error en getOfertasRecomendadas:', error);
    return res.status(500).json({ success: false, message: 'Error al obtener ofertas recomendadas.' });
  }
};

// ── Detalle de oferta ─────────────────────────────────────────────────────────

exports.getOfertaById = async (req, res) => {
  try {
    const oferta = await Oferta.findOne({
      where: { id: req.params.id, estado: 'activa', moderada: true },
      include: [{ model: Empresa, as: 'empresa', attributes: ['id', 'razonSocial', 'logo', 'rubro', 'ciudad'] }],
    });
    if (!oferta) return res.status(404).json({ success: false, message: 'Oferta no encontrada.' });

    await oferta.increment('vistas');
    return res.json({ success: true, data: oferta });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error al obtener la oferta.' });
  }
};

// ── Crear oferta ──────────────────────────────────────────────────────────────

exports.createOferta = async (req, res) => {
  try {
    const empresa = await _resolverEmpresa(req);
    if (!empresa) return res.status(400).json({ success: false, message: 'No tenés empresa registrada.' });

    if (empresa.estadoAprobacion !== 'aprobada') {
      return res.status(403).json({ success: false, message: 'Tu empresa aún no fue aprobada.' });
    }

    const { error, campos } = ofertaService.validarCamposPuesto(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const oferta = await Oferta.create({ ...req.body, ...campos, empresaId: empresa.id, moderada: false });

    ofertaService.notificarAdminsNuevaOferta(oferta, empresa); // fire-and-forget

    return res.status(201).json({ success: true, message: 'Oferta creada. Pendiente de moderación.', data: oferta });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error al crear la oferta.' });
  }
};

// ── Actualizar oferta ─────────────────────────────────────────────────────────

exports.updateOferta = async (req, res) => {
  try {
    const empresa = await _resolverEmpresa(req);
    if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

    const oferta = await Oferta.findOne({ where: { id: req.params.id, empresaId: empresa.id } });
    if (!oferta) return res.status(404).json({ success: false, message: 'Oferta no encontrada.' });

    const { error, campos } = ofertaService.validarCamposPuesto(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    await oferta.update({ ...req.body, ...campos });
    return res.json({ success: true, data: oferta });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error al actualizar la oferta.' });
  }
};

// ── Cerrar oferta ─────────────────────────────────────────────────────────────

exports.deleteOferta = async (req, res) => {
  try {
    const empresa = await _resolverEmpresa(req);
    if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

    const oferta = await Oferta.findOne({ where: { id: req.params.id, empresaId: empresa.id } });
    if (!oferta) return res.status(404).json({ success: false, message: 'Oferta no encontrada.' });

    await oferta.update({ estado: 'cerrada' });
    return res.json({ success: true, message: 'Oferta cerrada correctamente.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error al cerrar la oferta.' });
  }
};
