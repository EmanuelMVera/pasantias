'use strict';
const request = require('supertest');
const app = require('../src/app');
const { crearAlumno, crearAdmin, loginYObtenerToken } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

describe('ADMIN', () => {
  const idsUsuarios = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  test('no-admin recibe 403 en rutas de admin', async () => {
    const { usuario: alumno, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno.id);

    const token = await loginYObtenerToken(alumno.email, passwordPlana);

    const res = await request(app)
      .get('/api/admin/usuarios')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('sin token, las rutas de admin devuelven 401', async () => {
    const res = await request(app).get('/api/admin/dashboard-general');
    expect(res.status).toBe(401);
  });

  test('admin no puede autodesactivarse vía toggle', async () => {
    const { usuario: admin, passwordPlana } = await crearAdmin();
    idsUsuarios.push(admin.id);

    const token = await loginYObtenerToken(admin.email, passwordPlana);

    const res = await request(app)
      .patch(`/api/admin/usuarios/${admin.id}/toggle`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
