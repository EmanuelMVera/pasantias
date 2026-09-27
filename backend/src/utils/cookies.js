'use strict';

/**
 * cookies.js — SEC-02.
 *
 * Lector mínimo de cookies del request (evita la dependencia `cookie-parser`
 * para las dos cookies que usa el sistema: `token` y `csrf_token`).
 * El seteo/borrado usa `res.cookie` / `res.clearCookie`, que son built-in de Express.
 */

const { config, duracionAMs } = require('../config/env');

const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {import('express').Request} req
 * @returns {Record<string,string>}
 */
function parseCookies(req) {
  const header = req.headers?.cookie;
  if (!header) return {};
  const out = {};
  for (const parte of header.split(';')) {
    const idx = parte.indexOf('=');
    if (idx < 0) continue;
    const nombre = parte.slice(0, idx).trim();
    if (!nombre) continue;
    let valor = parte.slice(idx + 1).trim();
    try { valor = decodeURIComponent(valor); } catch { /* valor crudo */ }
    out[nombre] = valor;
  }
  return out;
}

/**
 * Opciones de la cookie de sesión (JWT).
 *
 * - `persistent: false` (login SIN "Recordarme"): cookie de SESIÓN del
 *   navegador — sin `maxAge`/`Expires`, el navegador la descarta al cerrar
 *   la sesión. El JWT que lleva además expira en JWT_SESSION_EXPIRES_IN (8h).
 * - `persistent: true` (CON "Recordarme"): `maxAge` = JWT_EXPIRES_IN (7d).
 *
 * El resto de los atributos (httpOnly/secure/sameSite/domain/path) es idéntico
 * en ambos casos: así `cookieClearOptions()` borra cualquiera de las dos.
 */
function cookieOptionsToken({ persistent = false } = {}) {
  const isProd = process.env.NODE_ENV === 'production';
  const sameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'false' ? false : (isProd || sameSite === 'none'),
    sameSite,
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
    ...(persistent ? { maxAge: duracionAMs(config.jwt.expiresIn) || SIETE_DIAS_MS } : {}),
  };
}

/**
 * Opciones de la cookie CSRF — mismos atributos que la de token pero legible
 * por JS. Sigue siendo persistente (no autentica por sí sola: el double-submit
 * solo exige que header y cookie coincidan). Si falta, csrf.js la re-emite en
 * el próximo request, así que tampoco rompe una sesión corta.
 */
function cookieOptionsCsrf() {
  return { ...cookieOptionsToken({ persistent: true }), httpOnly: false };
}

/**
 * Opciones para BORRAR la cookie de sesión (`res.clearCookie`). Deben coincidir
 * exactamente con las de seteo salvo `maxAge` — si `path`/`domain`/`sameSite`/
 * `secure` difieren, el navegador no borra la cookie (queda una sesión zombi).
 * Punto único: antes esto estaba duplicado en auth.controller.js.
 */
function cookieClearOptions() {
  return cookieOptionsToken({ persistent: false });
}

module.exports = { parseCookies, cookieOptionsToken, cookieOptionsCsrf, cookieClearOptions };
