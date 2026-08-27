'use strict';
const request = require('supertest');
const app = require('../src/app');
const { crearAlumno, loginYObtenerToken } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

describe('USER', () => {
  const idsUsuarios = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  test('getPerfilPublico de un perfil privado devuelve 403 con code PERFIL_PRIVADO', async () => {
    const { usuario: alumnoPrivado } = await crearAlumno({ perfil: { visibilidadPerfil: false } });
    idsUsuarios.push(alumnoPrivado.id);
    const { usuario: otro, passwordPlana } = await crearAlumno();
    idsUsuarios.push(otro.id);

    const token = await loginYObtenerToken(otro.email, passwordPlana);

    const res = await request(app)
      .get(`/api/users/${alumnoPrivado.id}/perfil`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERFIL_PRIVADO');
  });

  test('subir un archivo de tipo no permitido a /perfil/cv devuelve 400 (no 500)', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);
    const token = await loginYObtenerToken(usuario.email, passwordPlana);

    const res = await request(app)
      .post('/api/users/perfil/cv')
      .set('Authorization', `Bearer ${token}`)
      .attach('cv', Buffer.from('esto no es un pdf'), { filename: 'cv.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
