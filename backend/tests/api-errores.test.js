'use strict';

/**
 * api-errores.test.js
 *
 * Robustez de la capa HTTP: 404 JSON para rutas inexistentes, 400 para JSON
 * malformado (antes 500), y forma reducida de GET /api/auth/me (nunca el
 * modelo Sequelize crudo).
 */

const request = require('supertest');
const app = require('../src/app');
const { crearAlumno, loginYObtenerToken } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

describe('Capa HTTP — errores y forma de respuesta', () => {
  const idsUsuarios = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  test('ruta /api inexistente → 404 con la forma estándar', async () => {
    const res = await request(app).get('/api/no-existe-esta-ruta');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Recurso no encontrado.' });
  });

  test('JSON malformado en el body → 400, no 500', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "roto"');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('GET /api/auth/me devuelve la forma reducida, sin campos internos', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);
    const token = await loginYObtenerToken(usuario.email, passwordPlana);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.usuario.email).toBe(usuario.email);
    expect(res.body.usuario).toHaveProperty('rol');
    expect(res.body.usuario).toHaveProperty('ultimoAcceso');
    for (const campo of ['password', 'tokenVersion', 'tokenReset', 'habilitado', 'activo', 'createdAt', 'updatedAt']) {
      expect(res.body.usuario[campo]).toBeUndefined();
    }
  });
});
