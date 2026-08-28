/**
 * empresa.middleware.js — Middlewares de membresía y autorización en el equipo de empresa.
 *
 * Exporta dos middlewares complementarios al sistema de autenticación JWT:
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  verifyEmpresaMember                                                        │
 * │  Resuelve la empresa a la que pertenece el usuario autenticado y la adjunta │
 * │  en req.empresa y req.miembroEmpresa para que los controllers la usen.      │
 * │                                                                             │
 * │  Flujo de resolución (en orden):                                            │
 * │    1. Si el usuario es admin_empresa directo (empresa.usuarioId === req.usuario.id) │
 * │       → adjunta empresa y crea un objeto miembro virtual con rol 'admin_empresa' │
 * │    2. Si tiene una membresía activa en empresa_usuarios                      │
 * │       → adjunta empresa y el registro de membresía real                     │
 * │    3. Si no tiene acceso → 404                                              │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  authorizeEmpresaRoles(...roles)                                            │
 * │  Factory que verifica que req.miembroEmpresa.rolInterno esté en la lista.   │
 * │  Debe usarse siempre DESPUÉS de verifyEmpresaMember.                       │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * Roles internos disponibles:
 *   admin_empresa → acceso completo (editar empresa, gestionar equipo, ofertas, postulaciones)
 *   reclutador    → acceso operativo (ofertas, postulaciones, chat); sin gestión de equipo
 *
 * Ejemplo de uso en rutas:
 *   const { verifyEmpresaMember, authorizeEmpresaRoles } = require('../middleware/empresa.middleware');
 *
 *   // Cualquier miembro activo puede ver el dashboard
 *   router.get('/dashboard', verifyToken, verifyEmpresaMember, ctrl.getDashboard);
 *
 *   // Solo admin_empresa puede gestionar el equipo
 *   router.post('/equipo', verifyToken, verifyEmpresaMember, authorizeEmpresaRoles('admin_empresa'), ctrl.solicitarReclutador);
 *
 * Changelog:
 * - v1.5: creación inicial (propietario/gerente/reclutador/viewer)
 * - v2.0: simplificación a admin_empresa/reclutador — migración 010
 */

'use strict';

const { Empresa, EmpresaUsuario } = require('../models');
const logger = require('../utils/logger');

/**
 * Middleware: resuelve la empresa del usuario autenticado y la adjunta al request.
 *
 * Adjunta en el request:
 *   req.empresa        → instancia de Empresa
 *   req.miembroEmpresa → instancia de EmpresaUsuario (o virtual si es propietario directo)
 *
 * Respuestas de error:
 *   404 → el usuario no tiene empresa registrada ni membresía
 *   403 → tiene membresía pero está inactiva
 */
const verifyEmpresaMember = async (req, res, next) => {
  try {
    const usuarioId = req.usuario.id;

    // ── 1. Verificar si es admin_empresa directo (empresa.usuarioId === su id) ─
    // Compatibilidad con cuentas donde el usuario es el dueño registrado de la empresa
    // pero puede no tener todavía registro en empresa_usuarios.
    const empresaPropia = await Empresa.findOne({ where: { usuarioId } });

    if (empresaPropia) {
      req.empresa = empresaPropia;
      // Construye un objeto virtual de membresía para el admin_empresa directo
      req.miembroEmpresa = {
        rolInterno: 'admin_empresa',
        activo: true,
        empresaId: empresaPropia.id,
        usuarioId,
        esAdminVirtual: true, // Indica que no es un registro real de empresa_usuarios
      };
      return next();
    }

    // ── 2. Verificar si es miembro del equipo (admin_empresa o reclutador) ────
    const membresia = await EmpresaUsuario.findOne({
      where: { usuarioId, activo: true },
      include: [{ model: Empresa, as: 'empresa' }],
    });

    if (!membresia) {
      return res.status(404).json({
        success: false,
        message: 'No tenés acceso a ninguna empresa. Necesitás ser invitado por un administrador.',
        code: 'SIN_EMPRESA',
      });
    }

    req.empresa = membresia.empresa;
    req.miembroEmpresa = membresia;
    return next();
  } catch (error) {
    (req.log || logger).error({ err: error }, 'verifyEmpresaMember_fallo');
    return res.status(500).json({ success: false, message: 'Error al verificar membresía.' });
  }
};

/**
 * Middleware factory: verifica que el rol interno del usuario esté en la lista permitida.
 *
 * Roles disponibles: 'admin_empresa' | 'reclutador'
 *
 * @param  {...string} roles - Roles permitidos
 * @returns {Function} Middleware de Express
 *
 * @example
 *   // Solo admin_empresa puede gestionar equipo
 *   authorizeEmpresaRoles('admin_empresa')
 *
 *   // Ambos roles pueden crear ofertas
 *   authorizeEmpresaRoles('admin_empresa', 'reclutador')
 */
const authorizeEmpresaRoles = (...roles) => {
  return (req, res, next) => {
    const rolActual = req.miembroEmpresa?.rolInterno;

    if (!rolActual) {
      return res.status(403).json({
        success: false,
        message: 'No se pudo verificar tu rol en la empresa.',
        code: 'SIN_ROL',
      });
    }

    // Verifica si el rol del usuario está en la lista de roles permitidos
    if (!roles.includes(rolActual)) {
      return res.status(403).json({
        success: false,
        message: `No tenés permisos para esta acción. Tu rol es '${rolActual}'.`,
        code: 'ROL_INSUFICIENTE',
        rolesPermitidos: roles,
      });
    }

    return next();
  };
};

module.exports = { verifyEmpresaMember, authorizeEmpresaRoles };
