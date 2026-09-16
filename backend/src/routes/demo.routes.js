'use strict';

/**
 * demo.routes.js — Prefijo de la API: /api/demo
 *
 * Único endpoint público (sin verifyToken): GET /status. Deliberadamente sin
 * autenticación — lo consume LoginPage antes de que exista sesión.
 */

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const demoCtrl = require('../controllers/demo.controller');

router.get('/status', asyncHandler(demoCtrl.getStatus));

module.exports = router;
