'use strict';
const request = require('supertest');
const app = require('../src/app');
const {
  crearEmpresaConAdmin,
  crearAlumno,
  crearOferta,
  loginYObtenerToken,
} = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');
const { Postulacion } = require('../src/models');

describe('MULTI-TENANT', () => {
  const idsUsuarios = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  test('5. empresa A no puede consultar postulantes de una oferta de empresa B', async () => {
    const { usuarioAdmin: adminA, passwordPlana: passA } = await crearEmpresaConAdmin();
    idsUsuarios.push(adminA.id);
    const { usuarioAdmin: adminB, empresa: empresaB } = await crearEmpresaConAdmin();
    idsUsuarios.push(adminB.id);
    const ofertaB = await crearOferta(empresaB);

    const tokenA = await loginYObtenerToken(adminA.email, passA);

    const res = await request(app)
      .get(`/api/postulaciones/oferta/${ofertaB.id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  test('6. empresa A no puede modificar una postulación de empresa B', async () => {
    const { usuarioAdmin: adminA, passwordPlana: passA } = await crearEmpresaConAdmin();
    idsUsuarios.push(adminA.id);
    const { usuarioAdmin: adminB, empresa: empresaB } = await crearEmpresaConAdmin();
    idsUsuarios.push(adminB.id);
    const ofertaB = await crearOferta(empresaB);
    const { usuario: alumno } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const postulacionB = await Postulacion.create({
      usuarioId: alumno.id,
      ofertaId: ofertaB.id,
      estado: 'en_revision',
    });

    const tokenA = await loginYObtenerToken(adminA.email, passA);

    const res = await request(app)
      .patch(`/api/postulaciones/${postulacionB.id}/estado`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ estado: 'preseleccionado' });

    expect(res.status).toBe(403);
  });
});
