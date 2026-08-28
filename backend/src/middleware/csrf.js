'use strict';

/**
 * csrf.js — SEC-02.
 *
 * Protección CSRF por double-submit token, necesaria al pasar el JWT a una
 * cookie (que el navegador manda sola). Complementa a `SameSite` y a la
 * ausencia de `express.urlencoded` (un <form> cross-site no puede mandar JSON
 * ni setear headers custom).
 *
 * - En toda respuesta: si no hay cookie `csrf_token`, se setea una (legible por
 *   JS — httpOnly:false — para que el frontend la reenvíe en el header).
 * - En métodos que mutan estado: el header `X-CSRF-Token` debe coincidir con la
 *   cookie `csrf_token`, si no → 403.
 * - Exentos: endpoints sin sesión previa (login/forgot/reset/logout) y la
 *   solicitud pública de empresa. Esos están cubiertos por rate limiting.
 * - `NODE_ENV=test`: se saltea (la suite no maneja cookies).
 */

const crypto = require('crypto');
const { parseCookies, cookieOptionsCsrf } = require('../utils/cookies');

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Paths (sin querystring) exentos de la verificación del token.
const EXENTOS = [
  'POST /api/auth/login',
  'POST /api/auth/forgot-password',
  'POST /api/auth/logout',
  'POST /api/solicitudes-empresa',
];
const esExento = (req) => {
  if (req.method === 'POST' && req.path.startsWith('/api/auth/reset-password/')) return true;
  return EXENTOS.includes(`${req.method} ${req.path}`);
};

const csrfProtection = (req, res, next) => {
  const cookies = parseCookies(req);
  let tokenCookie = cookies.csrf_token;

  // Asegura que el cliente siempre termine con una cookie CSRF.
  if (!tokenCookie) {
    tokenCookie = crypto.randomBytes(32).toString('hex');
    res.cookie('csrf_token', tokenCookie, cookieOptionsCsrf());
  }

  // La suite se saltea la verificación (no maneja cookies); seguridad.test.js
  // la activa con SEC_TESTS=1.
  if (process.env.NODE_ENV === 'test' && process.env.SEC_TESTS !== '1') return next();
  if (METODOS_SEGUROS.has(req.method)) return next();
  if (esExento(req)) return next();

  const tokenHeader = req.get('X-CSRF-Token');
  if (!tokenHeader || tokenHeader !== tokenCookie) {
    return res.status(403).json({
      success: false,
      code: 'CSRF',
      message: 'Token de seguridad inválido o ausente. Recargá la página e intentá de nuevo.',
    });
  }
  return next();
};

module.exports = csrfProtection;
