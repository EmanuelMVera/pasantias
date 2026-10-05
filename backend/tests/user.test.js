'use strict';
const request = require('supertest');
const app = require('../src/app');
const {
  crearAlumno, loginYObtenerToken, crearEmpresaConAdmin, agregarReclutador, crearOferta, crearPostulacion,
} = require('./helpers/factories');
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

  test('perfil privado: lo ven el propio alumno y la empresa a la que se postuló, no una empresa ajena', async () => {
    const { usuario: alumno, passwordPlana } = await crearAlumno({ perfil: { visibilidadPerfil: false } });
    idsUsuarios.push(alumno.id);

    const { empresa, usuarioAdmin } = await crearEmpresaConAdmin();
    const { usuarioReclutador } = await agregarReclutador(empresa);
    const oferta = await crearOferta(empresa, { creadaPorUsuarioId: usuarioReclutador.id });
    await crearPostulacion(alumno, oferta);

    const { empresa: ajena } = await crearEmpresaConAdmin();
    const { usuarioReclutador: reclutadorAjeno } = await agregarReclutador(ajena);
    idsUsuarios.push(usuarioAdmin.id, usuarioReclutador.id, reclutadorAjeno.id);

    const ver = async (email) => {
      const token = await loginYObtenerToken(email, passwordPlana);
      return request(app).get(`/api/users/${alumno.id}/perfil`).set('Authorization', `Bearer ${token}`);
    };

    expect((await ver(alumno.email)).status).toBe(200);
    expect((await ver(usuarioReclutador.email)).status).toBe(200);
    expect((await ver(usuarioAdmin.email)).status).toBe(200);
    const ajeno = await ver(reclutadorAjeno.email);
    expect(ajeno.status).toBe(403);
    expect(ajeno.body.code).toBe('PERFIL_PRIVADO');
  });
});
