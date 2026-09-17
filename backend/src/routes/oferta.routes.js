/**
 * oferta.routes.js — Rutas de gestión de ofertas de pasantía.
 *
 * Prefijo de la API: /api/ofertas
 *
 * Rutas públicas (sin autenticación):
 * - GET /               → Lista todas las ofertas activas y aprobadas
 * - GET /:id            → Detalle de una oferta específica
 *
 * Rutas protegidas (alumno/egresado):
 * - GET /recomendadas   → Buscador inteligente basado en el perfil del alumno [NUEVO]
 *
 * Rutas protegidas (empresa):
 * - POST /              → Publica una nueva oferta — SOLO reclutador. La empresa
 *                          representa una entidad institucional, no publica ofertas
 *                          operativas (feedback de la profesora, iteración RBAC-01).
 * - PUT /:id            → Edita el contenido de una oferta — SOLO reclutador, y
 *                          solo si es el creador (o la oferta es histórica sin
 *                          creador registrado). No acepta cambios de `estado`.
 * - PATCH /:id/estado   → Pausar/reactivar/cerrar — reclutador (solo su propia
 *                          oferta) o admin_empresa (cualquier oferta de su empresa,
 *                          control institucional). Único lugar donde cambia `estado`.
 *
 * ⚠️ ORDEN IMPORTANTE: /recomendadas debe ir ANTES de /:id para que Express
 *    no interprete la palabra "recomendadas" como un parámetro de ID.
 */

const router = require('express').Router();
const ctrl = require('../controllers/oferta.controller');
const { verifyToken, authorizeRoles } = require('../middleware/auth.middleware');
const { verifyEmpresaMember, authorizeEmpresaRoles } = require('../middleware/empresa.middleware');
const asyncHandler = require('../utils/asyncHandler');

// ── Rutas con path fijo (deben ir ANTES de /:id) ─────────────────────────────

// GET /api/ofertas/recomendadas — Ofertas sugeridas según el perfil del alumno
// Requiere autenticación; accesible para alumnos y egresados
router.get(
  '/recomendadas',
  verifyToken,
  authorizeRoles('alumno', 'egresado'),
  asyncHandler(ctrl.getOfertasRecomendadas)
);

// ── Rutas públicas ────────────────────────────────────────────────────────────
// Cualquier visitante puede ver las ofertas disponibles sin necesidad de estar logueado
router.get('/', asyncHandler(ctrl.getOfertas));           // Lista de ofertas con filtros opcionales
router.get('/:id', asyncHandler(ctrl.getOfertaById));     // Detalle de una oferta y su empresa

// ── Rutas empresa ────────────────────────────────────────────────────────────
// verifyEmpresaMember inyecta req.empresa/req.miembroEmpresa para los controllers.
// Crear y editar CONTENIDO es exclusivo del reclutador (RBAC-01): la empresa es
// una entidad institucional, no publica ni redacta ofertas operativas.
const soloReclutador = [
  verifyToken,
  authorizeRoles('empresa'),
  verifyEmpresaMember,
  authorizeEmpresaRoles('reclutador'),
];

// Cambiar estado (pausar/reactivar/cerrar) sí lo puede hacer admin_empresa,
// como control institucional — además del reclutador sobre su propia oferta.
// El controller decide el alcance exacto por rol (ver cambiarEstadoOferta).
const puedeCambiarEstado = [
  verifyToken,
  authorizeRoles('empresa'),
  verifyEmpresaMember,
  authorizeEmpresaRoles('admin_empresa', 'reclutador'),
];

router.post('/', ...soloReclutador, asyncHandler(ctrl.createOferta));                    // Crear oferta
router.put('/:id', ...soloReclutador, asyncHandler(ctrl.updateOferta));                  // Editar contenido
router.patch('/:id/estado', ...puedeCambiarEstado, asyncHandler(ctrl.cambiarEstadoOferta)); // Pausar/reactivar/cerrar

module.exports = router;
