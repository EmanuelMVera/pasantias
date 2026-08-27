/**
 * postulacion.routes.js — Rutas de postulaciones a ofertas de pasantía.
 *
 * Prefijo de la API: /api/postulaciones
 *
 * Rutas para alumnos/egresados:
 * - POST /          → Se postula a una oferta
 * - GET  /mis       → Historial de postulaciones propias
 *
 * Rutas para empresas (admin_empresa y reclutador pueden ver y gestionar):
 * - GET  /oferta/:ofertaId  → Ver candidatos de una oferta
 * - PATCH /:id/estado       → Actualizar el estado de una postulación
 *
 * Todos los miembros activos pueden ver; ambos roles pueden cambiar estados.
 *
 * Changelog:
 * - v1.0: implementación inicial
 * - v1.5: rutas de empresa usan verifyEmpresaMember para inyectar req.empresa
 *         · GET /oferta/:ofertaId → cualquier miembro del equipo
 *         · PATCH /:id/estado     → admin_empresa y reclutador
 */

const router = require('express').Router();
const ctrl = require('../controllers/postulacion.controller');
const { verifyToken, authorizeRoles } = require('../middleware/auth.middleware');
const { verifyEmpresaMember, authorizeEmpresaRoles } = require('../middleware/empresa.middleware');
const validate = require('../middleware/validate.middleware');
const { validateUpdateEstado } = require('../validators/postulacion.validator');
const asyncHandler = require('../utils/asyncHandler');

// ── Rutas alumno/egresado ─────────────────────────────────────────────────────
// Solo alumnos y egresados pueden postularse y ver su historial
router.post('/', verifyToken, authorizeRoles('alumno', 'egresado'), asyncHandler(ctrl.postular));
router.get('/mis', verifyToken, authorizeRoles('alumno', 'egresado'), asyncHandler(ctrl.getMisPostulaciones));

// ── Rutas empresa ─────────────────────────────────────────────────────────────
// Shorthand: token + rol sistema 'empresa' + membresía en equipo
const baseMiembroEmpresa = [verifyToken, authorizeRoles('empresa'), verifyEmpresaMember];

// Ver candidatos de una oferta — cualquier miembro activo del equipo
router.get(
  '/oferta/:ofertaId',
  ...baseMiembroEmpresa,
  asyncHandler(ctrl.getPostulacionesByOferta)
);

// Cambiar estado de una postulación — admin_empresa y reclutador
router.patch(
  '/:id/estado',
  ...baseMiembroEmpresa,
  authorizeEmpresaRoles('admin_empresa', 'reclutador'),
  validate(validateUpdateEstado),
  asyncHandler(ctrl.updateEstado)
);

module.exports = router;
