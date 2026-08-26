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
 * solicitudReclutador.service.js (REF-ADMIN-01).
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
const adminCtrl = require('../controllers/admin.controller');

// Shorthand para no repetir los middlewares en cada ruta
const soloAdmin = [verifyToken, authorizeRoles('admin')];

// ── Dashboard / métricas ──────────────────────────────────────────────────────
router.get('/dashboard-general', ...soloAdmin, adminCtrl.getDashboardGeneral);
router.get('/stats', ...soloAdmin, adminCtrl.getStats); // legacy
router.get('/actividad-reciente', ...soloAdmin, adminCtrl.getActividadReciente);

// ── CRUD de usuarios ───────────────────────────────────────────────────────────
router.get('/usuarios', ...soloAdmin, adminCtrl.getUsuarios);
router.get('/usuarios/:id', ...soloAdmin, adminCtrl.getUsuarioById);
router.post('/usuarios', ...soloAdmin, adminCtrl.crearUsuario);
router.put('/usuarios/:id', ...soloAdmin, adminCtrl.actualizarUsuario);
router.delete('/usuarios/:id', ...soloAdmin, adminCtrl.eliminarUsuario); // soft delete
router.patch('/usuarios/:id/toggle', ...soloAdmin, adminCtrl.toggleUsuario);

// ── Empresas — aprobación directa (distinto de "solicitudes de empresa") ──────
router.get('/empresas/pendientes', ...soloAdmin, adminCtrl.getEmpresasPendientes);
router.patch('/empresas/:id/aprobar', ...soloAdmin, adminCtrl.aprobarEmpresa);
router.patch('/empresas/:id/rechazar', ...soloAdmin, adminCtrl.rechazarEmpresa);

// ── Moderación de ofertas ─────────────────────────────────────────────────────
router.get('/ofertas/pendientes', ...soloAdmin, adminCtrl.getOfertasPendientes);
router.get('/ofertas', ...soloAdmin, adminCtrl.getOfertas);
router.patch('/ofertas/:id/moderar', ...soloAdmin, adminCtrl.moderarOferta);

// ── Logs de auditoría ──────────────────────────────────────────────────────────
router.get('/logs', ...soloAdmin, adminCtrl.getLogs);
router.get('/logs/export', ...soloAdmin, adminCtrl.exportarLogs);

// ── Solicitudes de registro de empresa ────────────────────────────────────────
router.get('/solicitudes-empresa', ...soloAdmin, adminCtrl.getSolicitudesEmpresa);
router.patch('/solicitudes-empresa/:id/aprobar', ...soloAdmin, adminCtrl.aprobarSolicitudEmpresa);
router.patch('/solicitudes-empresa/:id/rechazar', ...soloAdmin, adminCtrl.rechazarSolicitudEmpresa);

// ── Solicitudes de reclutadores ────────────────────────────────────────────────
router.get('/solicitudes-reclutador', ...soloAdmin, adminCtrl.getSolicitudesReclutador);
router.patch('/solicitudes-reclutador/:id/aprobar', ...soloAdmin, adminCtrl.aprobarSolicitudReclutador);
router.patch('/solicitudes-reclutador/:id/rechazar', ...soloAdmin, adminCtrl.rechazarSolicitudReclutador);

module.exports = router;
