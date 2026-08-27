'use strict';

const { Perfil } = require('../models');
const ofertaService     = require('../services/oferta.service');
const postulacionService = require('../services/postulacion.service');
const perfilService     = require('../services/perfil.service');

exports.getDashboard = async (req, res) => {
  const usuarioId = req.usuario.id;

  const [metricas, perfil] = await Promise.all([
    postulacionService.obtenerMetricasAlumno(usuarioId),
    Perfil.findOne({ where: { usuarioId } }),
  ]);

  const [ofertasRecomendadas, perfilCompleto] = await Promise.all([
    ofertaService.obtenerRecomendadasDashboard(perfil, usuarioId, req.usuario, 5),
    Promise.resolve(perfilService.calcularCompletitud(perfil, req.usuario)),
  ]);

  return res.json({
    success: true,
    data: { ...metricas, ofertasRecomendadas, perfilCompleto },
  });
};
