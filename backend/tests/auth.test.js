'use strict';
const request = require('supertest');
const app = require('../src/app');
const { crearAlumno } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');
const { confirmarImportacion } = require('../src/services/csvImportacion.service');

describe('AUTH', () => {
  const idsUsuarios = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  test('1. login válido devuelve token y datos del usuario', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: usuario.email, password: passwordPlana });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.usuario.email).toBe(usuario.email);
  });

  test('2. login con password incorrecta devuelve 401', async () => {
    const { usuario } = await crearAlumno();
    idsUsuarios.push(usuario.id);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: usuario.email, password: 'password-incorrecta' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('3. login con email inexistente y login con password incorrecta devuelven el mismo mensaje 401 (protección anti-enumeración)', async () => {
    const { usuario } = await crearAlumno();
    idsUsuarios.push(usuario.id);

    const resInexistente = await request(app)
      .post('/api/auth/login')
      .send({ email: `no-existe-${Date.now()}@test.local`, password: 'cualquiera123' });

    const resPasswordMala = await request(app)
      .post('/api/auth/login')
      .send({ email: usuario.email, password: 'password-incorrecta' });

    expect(resInexistente.status).toBe(401);
    expect(resPasswordMala.status).toBe(401);
    expect(resInexistente.body.message).toBe(resPasswordMala.body.message);
  });

  test('4. forgotPassword con email inexistente devuelve 200 con mensaje genérico (no revela si existe)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: `no-existe-${Date.now()}@test.local` });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/si el email está registrado/i);
  });

  test('5. resetPassword con token inválido devuelve 400', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password/token-que-no-existe')
      .send({ password: 'nuevaPassword123' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('6. cambiarPassword con password actual incorrecta devuelve 401', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: usuario.email, password: passwordPlana });
    const token = login.body.token;

    const res = await request(app)
      .put('/api/auth/cambiar-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ passwordActual: 'password-equivocada', nuevaPassword: 'otraPassword123' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('7. el token de activación del import CSV funciona con POST /reset-password/:token (misma infraestructura)', async () => {
    const suf = Date.now();
    const csv = [
      'legajo,nombre,apellido,email,rol,carrera,anioEgreso,telefono,ubicacion',
      `ACT-${suf},Activacion,Test,activacion-${suf}@test.local,alumno,,,,`,
    ].join('\n');

    const resumen = await confirmarImportacion(Buffer.from(csv, 'utf8'), {
      actorUsuarioId: null, ip: '127.0.0.1', requestId: 'test-activacion',
    });
    idsUsuarios.push(resumen.creados[0].id);
    // Sin SMTP configurado (tests/setup/env.js vacía EMAIL_USER/PASS) y
    // NODE_ENV=test !== production → devTokens viene en la respuesta.
    const token = resumen.devTokens?.[0]?.devToken;
    expect(typeof token).toBe('string');

    const activar = await request(app)
      .post(`/api/auth/reset-password/${token}`)
      .send({ password: 'NuevaPassword123' });
    expect(activar.status).toBe(200);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: `activacion-${suf}@test.local`, password: 'NuevaPassword123' });
    expect(login.status).toBe(200);
  });
});
