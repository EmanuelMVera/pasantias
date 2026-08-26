'use strict';
const request = require('supertest');
const app = require('../src/app');
const {
  crearAlumno,
  crearEmpresaConAdmin,
  crearOferta,
  crearArchivoCV,
  loginYObtenerToken,
} = require('./helpers/factories');
const { limpiarUsuarios, limpiarArchivoFisico, cerrarConexion } = require('./helpers/cleanup');
const { Postulacion } = require('../src/models');

describe('ARCHIVO', () => {
  const idsUsuarios = [];
  const rutasFisicas = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    rutasFisicas.forEach(limpiarArchivoFisico);
    await cerrarConexion();
  });

  test('alumno no puede descargar el CV de otro alumno', async () => {
    const { usuario: alumnoA, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumnoA.id);
    const { usuario: alumnoB } = await crearAlumno();
    idsUsuarios.push(alumnoB.id);
    const { archivo, rutaAbsoluta } = await crearArchivoCV(alumnoB);
    rutasFisicas.push(rutaAbsoluta);

    const tokenA = await loginYObtenerToken(alumnoA.email, passwordPlana);

    const res = await request(app)
      .get(`/api/archivos/${archivo.id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  test('empresa sin postulación real del candidato no puede descargar su CV', async () => {
    const { usuario: alumno } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const { archivo, rutaAbsoluta } = await crearArchivoCV(alumno);
    rutasFisicas.push(rutaAbsoluta);
    const { usuarioAdmin, passwordPlana } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);

    const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);

    const res = await request(app)
      .get(`/api/archivos/${archivo.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  test('empresa con postulación real del candidato sí puede descargar su CV', async () => {
    const { usuario: alumno } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const { archivo, rutaAbsoluta } = await crearArchivoCV(alumno);
    rutasFisicas.push(rutaAbsoluta);
    const { usuarioAdmin, empresa, passwordPlana } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const oferta = await crearOferta(empresa);
    await Postulacion.create({ usuarioId: alumno.id, ofertaId: oferta.id, estado: 'en_revision' });

    const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);

    const res = await request(app)
      .get(`/api/archivos/${archivo.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
