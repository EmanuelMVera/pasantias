'use strict';
const request = require('supertest');
const app = require('../src/app');
const {
  crearAlumno,
  crearAdmin,
  crearEmpresaConAdmin,
  loginYObtenerToken,
} = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

describe('CHAT', () => {
  const idsUsuarios = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  test('admin nunca es visible/leíble vía historial de chat', async () => {
    const { usuario: admin } = await crearAdmin();
    idsUsuarios.push(admin.id);
    const { usuario: alumno, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno.id);

    const token = await loginYObtenerToken(alumno.email, passwordPlana);

    const res = await request(app)
      .get(`/api/chat/${admin.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect([403, 404]).toContain(res.status);
  });

  test('empresa A no puede leer el historial/perfil de un usuario de empresa B', async () => {
    const { usuarioAdmin: adminA, passwordPlana: passA } = await crearEmpresaConAdmin();
    idsUsuarios.push(adminA.id);
    const { usuarioAdmin: adminB } = await crearEmpresaConAdmin();
    idsUsuarios.push(adminB.id);

    const tokenA = await loginYObtenerToken(adminA.email, passA);

    const res = await request(app)
      .get(`/api/chat/${adminB.id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect([403, 404]).toContain(res.status);
  });

  test('alumno puede enviar un mensaje a una empresa y leer su propio historial', async () => {
    const { usuario: alumno, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const { usuarioAdmin } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);

    const token = await loginYObtenerToken(alumno.email, passwordPlana);

    const envio = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ receptorId: usuarioAdmin.id, mensaje: 'Hola, ¿la pasantía sigue abierta?' });
    expect(envio.status).toBe(201);

    const historial = await request(app)
      .get(`/api/chat/${usuarioAdmin.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(historial.status).toBe(200);
    expect(historial.body.data.length).toBe(1);
  });
});
