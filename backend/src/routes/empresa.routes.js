/**
 * empresa.routes.js — Rutas del panel corporativo de empresa.
 *
 * Prefijo de la API: /api/empresas
 *
 * Todas las rutas requieren autenticación JWT (verifyToken).
 * El middleware verifyEmpresaMember resuelve la empresa y el rol del usuario
 * y los adjunta en req.empresa y req.miembroEmpresa para que los controllers los usen.
 *
 * ⚠️ ORDEN IMPORTANTE: las rutas con paths fijos (dashboard, mi-empresa, equipo)
 *    deben ir ANTES de cualquier ruta con parámetro dinámico (ej: /:id).
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Permisos por rol en el equipo                                             │
 * │                                                                             │
 * │  Acción                    │ admin_empresa │ reclutador │                    │
 * │  ─────────────────────────────────────────────────────────────────────    │
 * │  Ver dashboard             │      ✅       │     ✅     │                    │
 * │  Ver mis ofertas           │      ✅       │     ✅     │                    │
 * │  Ver equipo                │      ✅       │     ✅     │                    │
 * │  Editar perfil empresa     │      ✅       │     ❌     │                    │
 * │  Solicitar reclutador      │      ✅       │     ❌     │                    │
 * │  Ver solicitudes equipo    │      ✅       │     ❌     │                    │
 * │  Editar/suspender miembro  │      ✅       │     ❌     │                    │
 * │  Enviar recup. de acceso   │      ✅       │     ❌     │ (EST-10: nunca ve la contraseña) │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * Rutas disponibles:
 *
 * Panel corporativo:
 * - GET  /dashboard              → Métricas del panel (todos los roles)
 * - GET  /mis-ofertas            → Lista de ofertas propias (todos los roles)
 *
 * Perfil de empresa:
 * - GET  /mi-empresa             → Ver perfil (todos los miembros)
 * - PUT  /mi-empresa             → Actualizar perfil (solo admin_empresa)
 *
 * Equipo de reclutadores:
 * - GET  /equipo                 → Listar miembros (todos los miembros)
 * - GET  /equipo/solicitudes     → Ver solicitudes (solo admin_empresa)
 * - POST /equipo/solicitar       → Solicitar reclutador (solo admin_empresa)
 * - PATCH /equipo/:id            → Editar miembro (solo admin_empresa)
 * - DELETE /equipo/:id           → Dar de baja miembro (solo admin_empresa)
 * - POST  /equipo/:id/recuperacion → Enviar email de recuperación de acceso (solo admin_empresa)
 *
 * Changelog:
 * - v1.0: implementación inicial
 * - v1.5: integración de verifyEmpresaMember y authorizeEmpresaRoles
 * - v2.0: simplificación a admin_empresa/reclutador — migración 010
 * - v2.1 (EST-10): PATCH /equipo/:id/password (reset directo) reemplazado por
 *   POST /equipo/:id/recuperacion — el admin ya no puede elegir la contraseña
 */

'use strict';

const router = require('express').Router();
const { verifyToken, authorizeRoles } = require('../middleware/auth.middleware');
const { verifyEmpresaMember, authorizeEmpresaRoles } = require('../middleware/empresa.middleware');
const ctrl = require('../controllers/empresa.controller');

// Shorthand: token JWT + resolver empresa + rol en equipo
const miembro    = [verifyToken, verifyEmpresaMember];
// soloAdmin: solo admin_empresa puede gestionar equipo y editar perfil
const soloAdmin  = [...miembro, authorizeEmpresaRoles('admin_empresa')];
// ownerOGte eliminado: no existe gerente; soloAdmin reemplaza ambos

// Compatibilidad: rutas donde solo el rol sistema 'empresa' puede acceder
// (se mantiene para no romper integraciones externas existentes)
const soloEmpresa = [verifyToken, authorizeRoles('empresa')];

// ── Panel corporativo ─────────────────────────────────────────────────────────

// GET /api/empresas/dashboard — Métricas globales (todos los miembros del equipo)
router.get('/dashboard', ...miembro, ctrl.getDashboard);

// GET /api/empresas/mis-ofertas — Lista de ofertas con postulaciones (todos los miembros)
router.get('/mis-ofertas', ...miembro, ctrl.getMisOfertas);

// ── Perfil de empresa ─────────────────────────────────────────────────────────

// GET /api/empresas/mi-empresa — Datos de la empresa (todos los miembros)
router.get('/mi-empresa', ...miembro, ctrl.getMiEmpresa);

// PUT /api/empresas/mi-empresa — Actualiza perfil (solo admin_empresa)
router.put('/mi-empresa', ...soloAdmin, ctrl.updateMiEmpresa);

// ── Equipo de reclutadores ────────────────────────────────────────────────────

// GET /api/empresas/candidatos?estado=X — Todas las postulaciones de la empresa (todos los miembros)
router.get('/candidatos', ...miembro, ctrl.getAllCandidatos);

// GET /api/empresas/equipo — Lista todos los miembros del equipo (todos los miembros)
router.get('/equipo', ...miembro, ctrl.getEquipo);

// GET /api/empresas/equipo/solicitudes — Lista solicitudes de reclutadores (solo admin_empresa)
// ⚠️ DEBE ir ANTES de /equipo/:id
router.get('/equipo/solicitudes', ...soloAdmin, ctrl.getMisSolicitudesReclutador);

// POST /api/empresas/equipo/solicitar — Envía solicitud de alta al admin (solo admin_empresa)
// El admin es quien crea el usuario al aprobar. La empresa NO crea usuarios directamente.
router.post('/equipo/solicitar', ...soloAdmin, ctrl.solicitarReclutador);

// POST /api/empresas/equipo/:id/recuperacion — Envía email de recuperación de acceso
// a un miembro (solo admin_empresa). El admin nunca elige ni ve la contraseña — el
// propio miembro la establece siguiendo el link del email (EST-10).
// ⚠️ DEBE ir ANTES de /equipo/:id para que Express no interprete 'recuperacion' como un id
router.post('/equipo/:id/recuperacion', ...soloAdmin, ctrl.enviarRecuperacionMiembro);

// PATCH /api/empresas/equipo/:id — Actualiza rol o estado de un miembro (solo admin_empresa)
// Body: { rolInterno?, activo? }
router.patch('/equipo/:id', ...soloAdmin, ctrl.updateMiembro);

// DELETE /api/empresas/equipo/:id — Da de baja un miembro (solo admin_empresa)
router.delete('/equipo/:id', ...soloAdmin, ctrl.removeMiembro);

// ── Perfil público de empresa ─────────────────────────────────────────────────
// ⚠️ DEBE ir al final — la ruta /:id captura cualquier path si va antes de los fijos
// GET /api/empresas/:id — Solo empresas aprobadas; incluye últimas 10 ofertas activas
router.get('/:id', verifyToken, ctrl.getEmpresaPublica);

module.exports = router;
