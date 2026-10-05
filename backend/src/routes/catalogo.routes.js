/**
 * catalogo.routes.js — catálogos institucionales de solo lectura.
 *
 * Prefijo: /api/catalogos
 * - GET /carreras → { success, data: [carrera, ...] } (público, sin auth: lo
 *   usa el formulario público de solicitud de empresa).
 */

const router = require('express').Router();
const { CARRERAS } = require('../services/catalogo.service');

router.get('/carreras', (req, res) => {
  // Lista estática versionada con el código: cacheable un rato por el navegador.
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ success: true, data: CARRERAS });
});

module.exports = router;
