'use strict';

/**
 * sesion.test.js — "Recordarme" y ciclo de vida de la sesión.
 *
 * - Sin "Recordarme": cookie `token` de SESIÓN (sin Max-Age/Expires) + JWT de
 *   JWT_SESSION_EXPIRES_IN (8h por defecto).
 * - Con "Recordarme": cookie persistente (Max-Age = JWT_EXPIRES_IN, 7d) + JWT
 *   de 7 días.
 * - Logout / cambio de contraseña / reset invalidan la sesión en ambos casos
 *   (cookie borrada + tokenVersion).
 * - El double-submit CSRF sigue funcionando.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const { Usuario } = require('../src/models');
const authService = require('../src/services/auth.service');
const { duracionAMs, loadConfig, validateConfig } = require('../src/config/env');
const { cookieOptionsToken, cookieClearOptions, cookieOptionsCsrf } = require('../src/utils/cookies');
const { crearAlumno } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

const HORA = 3600;
const DIA = 24 * HORA;

function setCookie(res, name) {
  return (res.headers['set-cookie'] || []).find((c) => c.startsWith(`${name}=`)) || null;
}

function valor(cookie) {
  return cookie.split(';')[0];
}

async function login(email, password, extra = {}) {
  return request(app).post('/api/auth/login').send({ email, password, ...extra });
}

describe('SESIÓN — Recordarme', () => {
  const idsUsuarios = [];

  async function nuevoUsuario() {
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);
    return { usuario, passwordPlana };
  }

  afterAll(async () => {
    delete process.env.SEC_TESTS;
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  // ── Duraciones y opciones de cookie (unidad) ───────────────────────────────
  test('duracionAMs interpreta los formatos de JWT_EXPIRES_IN', () => {
    expect(duracionAMs('7d')).toBe(7 * DIA * 1000);
    expect(duracionAMs('8h')).toBe(8 * HORA * 1000);
    expect(duracionAMs('30m')).toBe(30 * 60 * 1000);
    expect(duracionAMs('3600')).toBe(HORA * 1000); // sin unidad = segundos
    expect(duracionAMs('siete dias')).toBeNull();
    expect(duracionAMs('')).toBeNull();
    expect(duracionAMs('0h')).toBeNull();
  });

  test('config: JWT_SESSION_EXPIRES_IN es opcional (8h) y se valida el formato', () => {
    const base = loadConfig({ NODE_ENV: 'test' });
    expect(base.jwt.expiresIn).toBe('7d');
    expect(base.jwt.sessionExpiresIn).toBe('8h');
    expect(validateConfig(base).some((e) => /JWT_/.test(e))).toBe(false);

    const mal = loadConfig({ NODE_ENV: 'test', JWT_SESSION_EXPIRES_IN: 'mucho', JWT_EXPIRES_IN: '7 semanas' });
    const errores = validateConfig(mal);
    expect(errores.some((e) => e.startsWith('JWT_SESSION_EXPIRES_IN'))).toBe(true);
    expect(errores.some((e) => e.startsWith('JWT_EXPIRES_IN'))).toBe(true);
  });

  test('opciones de cookie: sesión sin maxAge, persistente con maxAge; clear coincide en atributos', () => {
    const sesion = cookieOptionsToken({ persistent: false });
    const persistente = cookieOptionsToken({ persistent: true });
    expect(sesion.maxAge).toBeUndefined();
    expect(persistente.maxAge).toBe(7 * DIA * 1000);

    const clear = cookieClearOptions();
    expect(clear.maxAge).toBeUndefined();
    for (const k of ['httpOnly', 'secure', 'sameSite', 'domain', 'path']) {
      expect(clear[k]).toEqual(sesion[k]);
      expect(clear[k]).toEqual(persistente[k]);
    }

    // CSRF: mismos atributos, legible por JS y persistente (no autentica).
    const csrf = cookieOptionsCsrf();
    expect(csrf.httpOnly).toBe(false);
    expect(csrf.maxAge).toBe(7 * DIA * 1000);
    expect(csrf.path).toBe(sesion.path);
  });

  // ── Login ──────────────────────────────────────────────────────────────────
  test('sin Recordarme: cookie de sesión (sin Max-Age/Expires) y JWT de ~8h', async () => {
    const { usuario, passwordPlana } = await nuevoUsuario();
    const res = await login(usuario.email, passwordPlana);
    expect(res.status).toBe(200);

    const cookie = setCookie(res, 'token');
    expect(cookie).not.toBeNull();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).not.toMatch(/Max-Age=/i);
    expect(cookie).not.toMatch(/Expires=/i);

    const payload = jwt.decode(res.body.token);
    expect(payload.exp - payload.iat).toBe(8 * HORA);
    expect(payload.tokenVersion).toBe(0);
  });

  test('remember=false explícito también da sesión corta', async () => {
    const { usuario, passwordPlana } = await nuevoUsuario();
    const res = await login(usuario.email, passwordPlana, { remember: false });
    expect(setCookie(res, 'token')).not.toMatch(/Max-Age=/i);
    const payload = jwt.decode(res.body.token);
    expect(payload.exp - payload.iat).toBe(8 * HORA);
  });

  test('con Recordarme: cookie persistente de 7 días y JWT de 7 días', async () => {
    const { usuario, passwordPlana } = await nuevoUsuario();
    const res = await login(usuario.email, passwordPlana, { remember: true });
    expect(res.status).toBe(200);

    const cookie = setCookie(res, 'token');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(new RegExp(`Max-Age=${7 * DIA}\\b`));
    expect(cookie).toMatch(/Expires=/i);

    const payload = jwt.decode(res.body.token);
    expect(payload.exp - payload.iat).toBe(7 * DIA);
  });

  test("remember como string: solo 'true' exacto pide sesión persistente", async () => {
    const { usuario, passwordPlana } = await nuevoUsuario();

    const conTrue = await login(usuario.email, passwordPlana, { remember: 'true' });
    expect(setCookie(conTrue, 'token')).toMatch(/Max-Age=/i);

    for (const raro of ['si', 'yes', 1, '1', 'TRUE ', {}]) {
      const res = await login(usuario.email, passwordPlana, { remember: raro });
      expect(res.status).toBe(200);
      expect(setCookie(res, 'token')).not.toMatch(/Max-Age=/i);
      const payload = jwt.decode(res.body.token);
      expect(payload.exp - payload.iat).toBe(8 * HORA);
    }
  });

  test('ambas sesiones autentican /me con la cookie', async () => {
    const { usuario, passwordPlana } = await nuevoUsuario();
    for (const remember of [false, true]) {
      const res = await login(usuario.email, passwordPlana, { remember });
      const me = await request(app).get('/api/auth/me').set('Cookie', valor(setCookie(res, 'token')));
      expect(me.status).toBe(200);
      expect(me.body.usuario.email).toBe(usuario.email);
    }
  });

  // ── Logout ─────────────────────────────────────────────────────────────────
  test('logout borra la cookie en ambos casos, con los mismos atributos', async () => {
    const { usuario, passwordPlana } = await nuevoUsuario();
    for (const remember of [false, true]) {
      const res = await login(usuario.email, passwordPlana, { remember });
      const cookieLogin = setCookie(res, 'token');

      const out = await request(app).post('/api/auth/logout').set('Cookie', valor(cookieLogin));
      expect(out.status).toBe(200);
      const borrada = setCookie(out, 'token');
      expect(borrada).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);
      // Path/SameSite del borrado = los del seteo (si no, quedaría una sesión zombi).
      expect(borrada).toMatch(/Path=\//);
      const sameSite = /SameSite=(\w+)/i.exec(cookieLogin)?.[1];
      expect(borrada).toMatch(new RegExp(`SameSite=${sameSite}`, 'i'));
    }
  });

  // ── Revocación (tokenVersion) ──────────────────────────────────────────────
  test('cambiar contraseña invalida las sesiones abiertas (corta y persistente)', async () => {
    const { usuario, passwordPlana } = await nuevoUsuario();
    const corta = valor(setCookie(await login(usuario.email, passwordPlana), 'token'));
    const larga = valor(setCookie(await login(usuario.email, passwordPlana, { remember: true }), 'token'));

    const cambio = await request(app).put('/api/auth/cambiar-password')
      .set('Cookie', corta)
      .send({ passwordActual: passwordPlana, nuevaPassword: 'OtraClave123!' });
    expect(cambio.status).toBe(200);
    expect(setCookie(cambio, 'token')).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);

    for (const cookie of [corta, larga]) {
      const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
      expect(me.status).toBe(401);
    }

    // La contraseña nueva funciona y lleva la tokenVersion nueva.
    const nuevo = await login(usuario.email, 'OtraClave123!');
    expect(nuevo.status).toBe(200);
    expect(jwt.decode(nuevo.body.token).tokenVersion).toBe(1);
  });

  test('reset de contraseña invalida las sesiones abiertas', async () => {
    const { usuario, passwordPlana } = await nuevoUsuario();
    const larga = valor(setCookie(await login(usuario.email, passwordPlana, { remember: true }), 'token'));

    const tokenPlano = crypto.randomBytes(32).toString('hex');
    await Usuario.update({
      tokenReset: authService.hashTokenReset(tokenPlano),
      tokenResetExpira: new Date(Date.now() + HORA * 1000),
      tokenResetUsadoEn: null,
    }, { where: { id: usuario.id } });

    const reset = await request(app).post(`/api/auth/reset-password/${tokenPlano}`)
      .send({ password: 'ClaveReset123!' });
    expect(reset.status).toBe(200);

    const me = await request(app).get('/api/auth/me').set('Cookie', larga);
    expect(me.status).toBe(401);
  });

  // ── CSRF (double-submit) ───────────────────────────────────────────────────
  test('CSRF sigue exigiendo header == cookie con una sesión sin Recordarme', async () => {
    process.env.SEC_TESTS = '1';
    try {
      const { usuario, passwordPlana } = await nuevoUsuario();
      const agent = request.agent(app);
      const res = await agent.post('/api/auth/login').send({ email: usuario.email, password: passwordPlana });
      expect(res.status).toBe(200);
      const csrfCookie = setCookie(res, 'csrf_token');
      expect(csrfCookie).not.toBeNull();
      expect(csrfCookie).not.toMatch(/HttpOnly/i);
      const csrf = valor(csrfCookie).slice('csrf_token='.length);

      const sinHeader = await agent.patch('/api/notificaciones/leer-todas');
      expect(sinHeader.status).toBe(403);
      expect(sinHeader.body.code).toBe('CSRF');

      const conHeader = await agent.patch('/api/notificaciones/leer-todas').set('X-CSRF-Token', csrf);
      expect(conHeader.status).toBe(200);
    } finally {
      delete process.env.SEC_TESTS;
    }
  });
});
