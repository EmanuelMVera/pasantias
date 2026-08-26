'use strict';
const request = require('supertest');
const app = require('../src/app');
const { crearAlumno } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

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
});
