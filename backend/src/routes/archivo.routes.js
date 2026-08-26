/**
 * archivo.routes.js — Acceso autenticado a archivos privados (SEC-01).
 *
 * Prefijo de la API: /api/archivos
 *
 * Reemplaza el acceso directo por /uploads (público, sin auth) para CV y
 * cartas de recomendación. Avatares/logos NO pasan por acá — siguen siendo
 * URLs públicas (hoy casi siempre externas; el día que haya upload local
 * real, se sirven desde /uploads/public vía express.static, sin auth).
 *
 * GET /:id — verifyToken obligatorio; la autorización fina (propietario,
 * admin, empresa legitimada) vive en archivo.service.js.
 */

'use strict';

const router = require('express').Router();
const { verifyToken } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/archivo.controller');

router.get('/:id', verifyToken, ctrl.descargar);

module.exports = router;
