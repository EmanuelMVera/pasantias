'use strict';
const request = require('supertest');
const app = require('../src/app');
const {
  crearAlumno,
  crearEmpresaConAdmin,
  crearOferta,
  loginYObtenerToken,
} = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

describe('POSTULACION', () => {
  const idsUsuarios = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  test('7. alumno con CV puede postularse a una oferta activa', async () => {
    const { usuario: alumno, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const { usuarioAdmin, empresa } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const oferta = await crearOferta(empresa);

    const tokenAlumno = await loginYObtenerToken(alumno.email, passwordPlana);

    const res = await request(app)
      .post('/api/postulaciones')
      .set('Authorization', `Bearer ${tokenAlumno}`)
      .send({ ofertaId: oferta.id });

    expect(res.status).toBe(201);
  });

  test('8. postularse dos veces a la misma oferta falla', async () => {
    const { usuario: alumno, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const { usuarioAdmin, empresa } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const oferta = await crearOferta(empresa);

    const tokenAlumno = await loginYObtenerToken(alumno.email, passwordPlana);

    await request(app)
      .post('/api/postulaciones')
      .set('Authorization', `Bearer ${tokenAlumno}`)
      .send({ ofertaId: oferta.id });

    const res = await request(app)
      .post('/api/postulaciones')
      .set('Authorization', `Bearer ${tokenAlumno}`)
      .send({ ofertaId: oferta.id });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('POSTULACION_DUPLICADA');
  });

  test('9. cambiar estado a un valor inválido devuelve 400', async () => {
    const { usuario: alumno, passwordPlana: passAlumno } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const { usuarioAdmin, empresa, passwordPlana: passEmpresa } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const oferta = await crearOferta(empresa);

    const tokenAlumno = await loginYObtenerToken(alumno.email, passAlumno);
    const postulacionRes = await request(app)
      .post('/api/postulaciones')
      .set('Authorization', `Bearer ${tokenAlumno}`)
      .send({ ofertaId: oferta.id });
    const postulacionId = postulacionRes.body.data.id;

    const tokenEmpresa = await loginYObtenerToken(usuarioAdmin.email, passEmpresa);

    const res = await request(app)
      .patch(`/api/postulaciones/${postulacionId}/estado`)
      .set('Authorization', `Bearer ${tokenEmpresa}`)
      .send({ estado: 'no_existe' });

    expect(res.status).toBe(400);
  });
});
