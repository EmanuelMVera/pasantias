'use strict';

/**
 * cookies.js — SEC-02.
 *
 * Lector mínimo de cookies del request (evita la dependencia `cookie-parser`
 * para las dos cookies que usa el sistema: `token` y `csrf_token`).
 * El seteo/borrado usa `res.cookie` / `res.clearCookie`, que son built-in de Express.
 */

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

/** Opciones base de la cookie de sesión (JWT). */
function cookieOptionsToken() {
  const isProd = process.env.NODE_ENV === 'production';
  const sameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'false' ? false : (isProd || sameSite === 'none'),
    sameSite,
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

/** Opciones de la cookie CSRF — igual que la de token pero legible por JS. */
function cookieOptionsCsrf() {
  return { ...cookieOptionsToken(), httpOnly: false };
}

/**
 * Opciones para BORRAR la cookie de sesión (`res.clearCookie`). Deben coincidir
 * exactamente con las de seteo salvo `maxAge` — si `path`/`domain`/`sameSite`/
 * `secure` difieren, el navegador no borra la cookie (queda una sesión zombi).
 * Punto único: antes esto estaba duplicado en auth.controller.js.
 */
function cookieClearOptions() {
  const { maxAge, ...rest } = cookieOptionsToken();
  return rest;
}

module.exports = { parseCookies, cookieOptionsToken, cookieOptionsCsrf, cookieClearOptions };
