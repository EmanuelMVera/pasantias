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
const {
  login,
  me,
  forgotPassword,
  resetPassword,
  cambiarPassword,
} = require('../controllers/auth.controller');

router.post('/login',                login);
router.get('/me',          verifyToken, me);
router.post('/forgot-password',      forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.put('/cambiar-password', verifyToken, validate(validateCambiarPassword), cambiarPassword);

module.exports = router;
