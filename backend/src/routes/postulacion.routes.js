/**
 * postulacion.routes.js — Rutas de postulaciones a ofertas de pasantía.
 *
 * Prefijo de la API: /api/postulaciones
 *
 * Rutas para alumnos/egresados:
 * - POST /          → Se postula a una oferta
 * - GET  /mis       → Historial de postulaciones propias
 *
 * Rutas para empresas:
 * - GET  /oferta/:ofertaId  → Ver candidatos de una oferta (cualquier miembro activo)
 * - PATCH /:id/estado       → Actualizar el estado de una postulación (solo reclutador
 *                             responsable de la oferta — RBAC-02)
 *
 * Todos los miembros activos pueden VER candidatos de cualquier oferta de su empresa
 * (visión global, igual que ya pasa con el listado de ofertas). Las acciones operativas
 * sobre un candidato (cambiar estado, notas) son del reclutador responsable de esa
 * oferta — admin_empresa no opera candidatos, solo consulta (ver oferta.controller.js
 * para el mismo patrón sobre ofertas).
 *
 * Changelog:
 * - v1.0: implementación inicial
 * - v1.5: rutas de empresa usan verifyEmpresaMember para inyectar req.empresa
 *         · GET /oferta/:ofertaId → cualquier miembro del equipo
 *         · PATCH /:id/estado     → admin_empresa y reclutador
 * - v1.6 (RBAC-02): PATCH /:id/estado pasa a ser exclusivo de reclutador, y solo
 *         del responsable de la oferta (mismo criterio que updateOferta/
 *         cambiarEstadoOferta) — admin_empresa mantiene solo GET /oferta/:ofertaId.
 */

const router = require('express').Router();
const ctrl = require('../controllers/postulacion.controller');
const { verifyToken, authorizeRoles } = require('../middleware/auth.middleware');
const { verifyEmpresaMember, authorizeEmpresaRoles } = require('../middleware/empresa.middleware');
const validate = require('../middleware/validate.middleware');
const { validateUpdateEstado } = require('../validators/postulacion.validator');
const asyncHandler = require('../utils/asyncHandler');
const { writeLimiter } = require('../middleware/rateLimit');

// ── Rutas alumno/egresado ─────────────────────────────────────────────────────
// Solo alumnos y egresados pueden postularse y ver su historial
router.post('/', verifyToken, authorizeRoles('alumno', 'egresado'), writeLimiter, asyncHandler(ctrl.postular));
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

// Cambiar estado de una postulación — solo reclutador (y solo el responsable
// de la oferta, chequeado en el controller — RBAC-02).
router.patch(
  '/:id/estado',
  ...baseMiembroEmpresa,
  authorizeEmpresaRoles('reclutador'),
  validate(validateUpdateEstado),
  asyncHandler(ctrl.updateEstado)
);

module.exports = router;
