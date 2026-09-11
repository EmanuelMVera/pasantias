/**
 * auth.middleware.js — Middlewares de autenticación y autorización.
 *
 * Exporta dos middlewares:
 * - verifyToken: verifica que el request tenga un JWT válido y actualiza ultimoAcceso
 * - authorizeRoles: verifica que el usuario tenga alguno de los roles requeridos
 *
 * Se usan en las rutas protegidas de la API.
 *
 * Changelog:
 * - v1.1: verifyToken actualiza ultimoAcceso en cada request autenticada (fire-and-forget)
 *         authorizeRoles soporta cualquier combinación de roles: admin, alumno, egresado,
 *         empresa, profesor
 */

const jwt = require('jsonwebtoken');
const { Usuario } = require('../models');
const { parseCookies } = require('../utils/cookies');
const { config } = require('../config/env');
const logger = require('../utils/logger');

/**
 * Middleware: verifica que el token JWT del header Authorization sea válido.
 *
 * Proceso:
 * 1. Extrae el token del header "Authorization: Bearer <token>"
 * 2. Verifica la firma del token con JWT_SECRET
 * 3. Busca el usuario en la base de datos y verifica que esté activo
 * 4. Actualiza ultimoAcceso (fire-and-forget, no bloquea la request)
 * 5. Adjunta el usuario al objeto `req` para que los siguientes handlers lo usen
 */
const verifyToken = async (req, res, next) => {
  // SEC-02: el token viaja en la cookie `token` (HttpOnly). Fallback al header
  // `Authorization: Bearer` para clientes API / la suite de tests.
  const authHeader = req.headers['authorization'];
  const token = parseCookies(req).token || (authHeader && authHeader.split(' ')[1]);

  // Si no se envió un token, se rechaza el acceso
  if (!token) {
    return res.status(401).json({ success: false, message: 'Token requerido.' });
  }

  // Verifica y decodifica el token. Sólo un token malo/expirado es 401; un
  // fallo de DB más abajo es un 500 y va al manejador global (antes se
  // reportaba como "Token inválido", ocultando la caída real).
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token inválido o expirado.' });
  }

  try {
    // Busca el usuario en la DB, excluyendo campos sensibles
    const usuario = await Usuario.findByPk(decoded.id, {
      attributes: { exclude: ['password', 'tokenReset', 'tokenResetExpira'] },
    });

    // Si el usuario no existe o fue desactivado, se rechaza el acceso
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ success: false, message: 'Usuario no encontrado o inactivo.' });
    }

    // Revocación de sesiones (EST-08 §5.3): si tokenVersion cambió desde que
    // se emitió este JWT (cambio de contraseña, "cerrar sesión en todos los
    // dispositivos"), el token queda inválido aunque no haya expirado.
    if ((decoded.tokenVersion ?? 0) !== usuario.tokenVersion) {
      return res.status(401).json({ success: false, message: 'Tu sesión expiró. Iniciá sesión de nuevo.' });
    }

    // Actualiza la fecha de último acceso de forma no bloqueante.
    // El catch silencioso evita que un error de DB interrumpa la request del usuario.
    usuario.update({ ultimoAcceso: new Date() }).catch((err) =>
      (req.log || logger).warn({ err }, 'ultimoAcceso_no_actualizado')
    );

    // Adjunta el usuario al request para que los controllers lo puedan usar
    req.usuario = usuario;
    next();
  } catch (err) {
    return next(err);
  }
};

/**
 * Middleware factory: verifica que el usuario tenga alguno de los roles permitidos.
 *
 * Se usa después de verifyToken y recibe una lista de roles válidos.
 *
 * Roles disponibles en el sistema:
 *   'alumno' | 'egresado' | 'empresa' | 'admin'
 *
 * Ejemplos de uso:
 *   authorizeRoles('admin')                          → solo administradores
 *   authorizeRoles('alumno', 'egresado')             → alumnos y egresados
 *   authorizeRoles('admin', 'empresa')               → múltiples roles
 *
 * @param  {...string} roles - Roles permitidos para la ruta
 */
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    // Si el rol del usuario no está en la lista permitida, se deniega el acceso
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({
        success: false,
        message: 'No tenés permisos para realizar esta acción.',
      });
    }
    next();
  };
};

module.exports = { verifyToken, authorizeRoles };
