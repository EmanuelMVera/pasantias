/**
 * admin.routes.js — Rutas del panel de administración.
 *
 * Prefijo de la API: /api/admin
 *
 * Todas las rutas requieren: verifyToken + rol 'admin'
 *
 * Routing puro — la lógica vive en controllers/admin.controller.js, que a su
 * vez delega a services/admin.service.js, adminUsuarios.service.js,
 * adminModeracion.service.js, solicitudEmpresa.service.js y
 * solicitudReclutador.service.js (REF-ADMIN-01). Cada handler está envuelto
 * en asyncHandler — los errores esperables (HttpError) y los inesperados
 * llegan por igual a error.middleware.js (REF-ERR-01).
 *
 * Módulos:
 * 1. Dashboard general con métricas del sistema
 * 2. Gestión completa de usuarios (CRUD + cambio de rol)
 * 3. Gestión de empresas pendientes de aprobación (directa sobre Empresa)
 * 4. Moderación de ofertas antes de publicarlas
 * 5. Logs de auditoría del sistema (con filtros y exportación CSV)
 * 6. Gestión de solicitudes de registro de empresa y de reclutadores
 */

const router = require('express').Router();
const { verifyToken, authorizeRoles } = require('../middleware/auth.middleware');
const asyncHandler = require('../utils/asyncHandler');
const adminCtrl = require('../controllers/admin.controller');

// Shorthand para no repetir los middlewares en cada ruta
const soloAdmin = [verifyToken, authorizeRoles('admin')];

// ── Dashboard / métricas ──────────────────────────────────────────────────────
router.get('/dashboard-general', ...soloAdmin, asyncHandler(adminCtrl.getDashboardGeneral));
router.get('/stats', ...soloAdmin, asyncHandler(adminCtrl.getStats)); // legacy
router.get('/actividad-reciente', ...soloAdmin, asyncHandler(adminCtrl.getActividadReciente));

// ── CRUD de usuarios ───────────────────────────────────────────────────────────
router.get('/usuarios', ...soloAdmin, asyncHandler(adminCtrl.getUsuarios));
router.get('/usuarios/:id', ...soloAdmin, asyncHandler(adminCtrl.getUsuarioById));
router.post('/usuarios', ...soloAdmin, asyncHandler(adminCtrl.crearUsuario));
router.put('/usuarios/:id', ...soloAdmin, asyncHandler(adminCtrl.actualizarUsuario));
router.delete('/usuarios/:id', ...soloAdmin, asyncHandler(adminCtrl.eliminarUsuario)); // soft delete
router.patch('/usuarios/:id/toggle', ...soloAdmin, asyncHandler(adminCtrl.toggleUsuario));

// ── Empresas — aprobación directa (distinto de "solicitudes de empresa") ──────
router.get('/empresas/pendientes', ...soloAdmin, asyncHandler(adminCtrl.getEmpresasPendientes));
router.patch('/empresas/:id/aprobar', ...soloAdmin, asyncHandler(adminCtrl.aprobarEmpresa));
router.patch('/empresas/:id/rechazar', ...soloAdmin, asyncHandler(adminCtrl.rechazarEmpresa));

// ── Moderación de ofertas ─────────────────────────────────────────────────────
router.get('/ofertas/pendientes', ...soloAdmin, asyncHandler(adminCtrl.getOfertasPendientes));
router.get('/ofertas', ...soloAdmin, asyncHandler(adminCtrl.getOfertas));
router.patch('/ofertas/:id/moderar', ...soloAdmin, asyncHandler(adminCtrl.moderarOferta));

// ── Logs de auditoría ──────────────────────────────────────────────────────────
router.get('/logs', ...soloAdmin, asyncHandler(adminCtrl.getLogs));
router.get('/logs/export', ...soloAdmin, asyncHandler(adminCtrl.exportarLogs));

// ── Solicitudes de registro de empresa ────────────────────────────────────────
router.get('/solicitudes-empresa', ...soloAdmin, asyncHandler(adminCtrl.getSolicitudesEmpresa));
router.patch('/solicitudes-empresa/:id/aprobar', ...soloAdmin, asyncHandler(adminCtrl.aprobarSolicitudEmpresa));
router.patch('/solicitudes-empresa/:id/rechazar', ...soloAdmin, asyncHandler(adminCtrl.rechazarSolicitudEmpresa));

// ── Solicitudes de reclutadores ────────────────────────────────────────────────
router.get('/solicitudes-reclutador', ...soloAdmin, asyncHandler(adminCtrl.getSolicitudesReclutador));
router.patch('/solicitudes-reclutador/:id/aprobar', ...soloAdmin, asyncHandler(adminCtrl.aprobarSolicitudReclutador));
router.patch('/solicitudes-reclutador/:id/rechazar', ...soloAdmin, asyncHandler(adminCtrl.rechazarSolicitudReclutador));

module.exports = router;
