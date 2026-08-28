'use strict';

/**
 * seguridad.test.js — SEC-02.
 *
 * Ejercita el hardening HTTP (rate limiting, CSRF, cookie de sesión, headers,
 * validación de contenido de archivos). Los limiters y el CSRF se saltean en
 * el resto de la suite; acá se activan con SEC_TESTS=1.
 */

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/app');
const { crearAlumno } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

const UPLOADS_DIR = path.join(__dirname, '../uploads');

function cookieVal(res, name) {
  const arr = res.headers['set-cookie'] || [];
  const found = arr.find((c) => c.startsWith(`${name}=`));
  return found ? found.split(';')[0].slice(name.length + 1) : null;
}

describe('SEC-02 — Hardening HTTP', () => {
  const idsUsuarios = [];
  const archivosCreados = [];

  beforeAll(() => { process.env.SEC_TESTS = '1'; });

  afterAll(async () => {
    delete process.env.SEC_TESTS;
    for (const p of archivosCreados) { try { fs.rmSync(p, { force: true }); } catch { /* nada */ } }
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  // ── Headers ─────────────────────────────────────────────────────────────────
  test('helmet: respuestas con nosniff y sin X-Powered-By', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  // ── Cookie de sesión ────────────────────────────────────────────────────────
  test('login setea cookie token HttpOnly y autentica sin header Authorization', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);

    const login = await request(app).post('/api/auth/login')
      .send({ email: usuario.email, password: passwordPlana });
    expect(login.status).toBe(200);

    const setCookies = login.headers['set-cookie'] || [];
    const tokenCookie = setCookies.find((c) => c.startsWith('token='));
    expect(tokenCookie).toBeDefined();
    expect(tokenCookie).toMatch(/HttpOnly/i);

    const me = await request(app).get('/api/auth/me')
      .set('Cookie', tokenCookie.split(';')[0]); // sin Authorization
    expect(me.status).toBe(200);
    expect(me.body.usuario.email).toBe(usuario.email);
  });

  test('logout borra la cookie token', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    const cleared = (res.headers['set-cookie'] || []).find((c) => c.startsWith('token='));
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);
  });

  // ── CSRF ────────────────────────────────────────────────────────────────────
  test('POST autenticado sin X-CSRF-Token → 403; con el token de la cookie → pasa', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);

    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login')
      .send({ email: usuario.email, password: passwordPlana });
    const csrf = cookieVal(login, 'csrf_token');
    expect(csrf).toBeTruthy();

    const sinToken = await agent.post('/api/chat').send({ receptorId: 999999, mensaje: 'hola' });
    expect(sinToken.status).toBe(403);
    expect(sinToken.body.code).toBe('CSRF');

    const conToken = await agent.post('/api/chat')
      .set('X-CSRF-Token', csrf)
      .send({ receptorId: 999999, mensaje: 'hola' });
    expect(conToken.status).not.toBe(403); // pasa CSRF (luego 404: receptor inexistente)
  });

  // ── Rate limiting ───────────────────────────────────────────────────────────
  test('authLimiter: el 11º intento de login fallido devuelve 429', async () => {
    const email = `brute-${Date.now()}@test.local`;
    let ultima;
    for (let i = 0; i < 10; i++) {
      ultima = await request(app).post('/api/auth/login').send({ email, password: 'mala' });
      expect(ultima.status).toBe(401);
    }
    const bloqueada = await request(app).post('/api/auth/login').send({ email, password: 'mala' });
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.body.code).toBe('RATE_LIMITED');
  });

  test('passwordResetLimiter: tras varias solicitudes de recuperación aparece un 429', async () => {
    let got429 = false;
    for (let i = 0; i < 12 && !got429; i++) {
      const res = await request(app).post('/api/auth/forgot-password')
        .send({ email: `x-${i}-${Date.now()}@test.local` });
      if (res.status === 429) { got429 = true; expect(res.body.code).toBe('RATE_LIMITED'); }
      else expect(res.status).toBe(200);
    }
    expect(got429).toBe(true);
  });

  test('publicWriteLimiter: la 6ª POST /solicitudes-empresa devuelve 429', async () => {
    let res;
    for (let i = 0; i < 5; i++) {
      res = await request(app).post('/api/solicitudes-empresa').send({}); // body inválido → 400, igual cuenta
      expect(res.status).toBe(400);
    }
    res = await request(app).post('/api/solicitudes-empresa').send({});
    expect(res.status).toBe(429);
  });

  // ── forgot-password no filtra el token en producción ────────────────────────
  test('forgot-password NO devuelve devToken cuando NODE_ENV=production', async () => {
    const { usuario } = await crearAlumno();
    idsUsuarios.push(usuario.id);

    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await request(app).post('/api/auth/forgot-password').send({ email: usuario.email });
      // 200 (o 429 si el limiter de este archivo ya se disparó) — en ningún caso debe filtrar el token.
      expect(res.body.devToken).toBeUndefined();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  // ── Upload: validación de contenido (magic bytes) ───────────────────────────
  test('CV con Content-Type application/pdf pero contenido HTML → 400 y no queda en disco', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);

    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login')
      .send({ email: usuario.email, password: passwordPlana });
    const csrf = cookieVal(login, 'csrf_token');

    const res = await agent.post('/api/users/perfil/cv')
      .set('X-CSRF-Token', csrf)
      .attach('cv', Buffer.from('<html>no soy un pdf</html>'), { filename: 'fake.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no coincide/i);

    const restos = fs.readdirSync(UPLOADS_DIR).filter((f) => f.startsWith(`cv_${usuario.id}_`));
    expect(restos).toEqual([]);
  });

  test('CV con contenido PDF real → 200', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);

    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login')
      .send({ email: usuario.email, password: passwordPlana });
    const csrf = cookieVal(login, 'csrf_token');

    const res = await agent.post('/api/users/perfil/cv')
      .set('X-CSRF-Token', csrf)
      .attach('cv', Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n'), { filename: 'cv real.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.cvArchivoId).toBeTruthy();
    if (res.body.cvPath) archivosCreados.push(path.join(UPLOADS_DIR, path.basename(res.body.cvPath)));
  });
});
