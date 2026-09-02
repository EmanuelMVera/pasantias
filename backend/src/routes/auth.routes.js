/**
 * auth.routes.js — Rutas de autenticación del sistema.
 *
 * Prefijo de la API: /api/auth
 *
 * Rutas disponibles:
 * - POST /login                 → Inicia sesión y devuelve un JWT
 * - GET  /me                    → Devuelve el usuario autenticado (requiere token)
 * - POST /forgot-password       → Solicita el recupero de contraseña
 * - POST /reset-password/:token → Restablece la contraseña con el token recibido por email
 * - PUT  /cambiar-password      → Cambia la contraseña del usuario autenticado (requiere token)
 */

const router = require('express').Router();
const { verifyToken } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { validateCambiarPassword } = require('../validators/auth.validator');
const asyncHandler = require('../utils/asyncHandler');
const { authLimiter, authIpLimiter, passwordResetLimiter } = require('../middleware/rateLimit');
const {
  login,
  me,
  logout,
  forgotPassword,
  resetPassword,
  cambiarPassword,
} = require('../controllers/auth.controller');

router.post('/login',                 authIpLimiter, authLimiter, asyncHandler(login));
router.post('/logout',                asyncHandler(logout));
router.get('/me',          verifyToken, asyncHandler(me));
router.post('/forgot-password',       passwordResetLimiter, asyncHandler(forgotPassword));
router.post('/reset-password/:token', passwordResetLimiter, asyncHandler(resetPassword));
router.put('/cambiar-password', verifyToken, validate(validateCambiarPassword), asyncHandler(cambiarPassword));

module.exports = router;
