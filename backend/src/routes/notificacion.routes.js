/**
 * notificacion.routes.js — Rutas de notificaciones del sistema.
 *
 * Prefijo de la API: /api/notificaciones
 *
 * IMPORTANTE: las rutas con paths fijos DEBEN ir ANTES de las rutas con parámetros
 * dinámicos (/:id) para que Express no confunda "leer-todas" con un id.
 *
 * Rutas:
 * - GET    /                → Lista las últimas 50 notificaciones del usuario
 * - GET    /sin-leer-count  → Devuelve solo el conteo de no leídas (para el badge)
 * - PATCH  /leer-todas      → Marca todas como leídas
 * - PATCH  /:id/leer        → Marca una notificación específica como leída
 * - DELETE /:id             → Elimina una notificación propia
 */

const router = require('express').Router();
const { verifyToken } = require('../middleware/auth.middleware');
const asyncHandler = require('../utils/asyncHandler');
const {
  getNotificaciones,
  getSinLeerCount,
  leerTodas,
  leerUna,
  eliminarNotificacion,
} = require('../controllers/notificacion.controller');

router.get('/',                verifyToken, asyncHandler(getNotificaciones));
router.get('/sin-leer-count',  verifyToken, asyncHandler(getSinLeerCount));
router.patch('/leer-todas',    verifyToken, asyncHandler(leerTodas));
router.patch('/:id/leer',      verifyToken, asyncHandler(leerUna));
router.delete('/:id',          verifyToken, asyncHandler(eliminarNotificacion));

module.exports = router;
