'use strict';
const request = require('supertest');
const app = require('../src/app');
const {
  crearAlumno,
  crearEmpresaConAdmin,
  agregarReclutador,
  crearOferta,
  crearPostulacion,
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
    const { empresa } = await crearEmpresaConAdmin();
    // RBAC-02: cambiar estado ya no lo hace admin_empresa — se necesita un
    // reclutador responsable de la oferta (huérfana, sin creadaPorUsuarioId,
    // así que cualquier reclutador activo de la empresa lo es).
    const { usuarioReclutador, passwordPlana: passReclutador } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);
    const oferta = await crearOferta(empresa);

    const tokenAlumno = await loginYObtenerToken(alumno.email, passAlumno);
    const postulacionRes = await request(app)
      .post('/api/postulaciones')
      .set('Authorization', `Bearer ${tokenAlumno}`)
      .send({ ofertaId: oferta.id });
    const postulacionId = postulacionRes.body.data.id;

    const tokenReclutador = await loginYObtenerToken(usuarioReclutador.email, passReclutador);

    const res = await request(app)
      .patch(`/api/postulaciones/${postulacionId}/estado`)
      .set('Authorization', `Bearer ${tokenReclutador}`)
      .send({ estado: 'no_existe' });

    expect(res.status).toBe(400);
  });

  describe('RBAC-02 — acciones operativas sobre candidatos', () => {
    test('reclutador responsable puede cambiar el estado de un candidato de su propia oferta', async () => {
      const { usuario: alumno } = await crearAlumno();
      idsUsuarios.push(alumno.id);
      const { empresa } = await crearEmpresaConAdmin();
      const { usuarioReclutador, passwordPlana } = await agregarReclutador(empresa);
      idsUsuarios.push(usuarioReclutador.id);
      const oferta = await crearOferta(empresa, { creadaPorUsuarioId: usuarioReclutador.id });
      const postulacion = await crearPostulacion(alumno, oferta);

      const token = await loginYObtenerToken(usuarioReclutador.email, passwordPlana);
      const res = await request(app)
        .patch(`/api/postulaciones/${postulacion.id}/estado`)
        .set('Authorization', `Bearer ${token}`)
        .send({ estado: 'preseleccionado' });

      expect(res.status).toBe(200);
      expect(res.body.data.estado).toBe('preseleccionado');
    });

    test('reclutador NO responsable (misma empresa, oferta de otro reclutador) no puede cambiar el estado', async () => {
      const { usuario: alumno } = await crearAlumno();
      idsUsuarios.push(alumno.id);
      const { empresa } = await crearEmpresaConAdmin();
      const { usuarioReclutador: responsable } = await agregarReclutador(empresa);
      idsUsuarios.push(responsable.id);
      const { usuarioReclutador: otro, passwordPlana: passOtro } = await agregarReclutador(empresa);
      idsUsuarios.push(otro.id);
      const oferta = await crearOferta(empresa, { creadaPorUsuarioId: responsable.id });
      const postulacion = await crearPostulacion(alumno, oferta);

      const tokenOtro = await loginYObtenerToken(otro.email, passOtro);
      const res = await request(app)
        .patch(`/api/postulaciones/${postulacion.id}/estado`)
        .set('Authorization', `Bearer ${tokenOtro}`)
        .send({ estado: 'preseleccionado' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NO_ES_RESPONSABLE');
    });

    test('admin_empresa no puede cambiar el estado de ningún candidato, ni de su propia empresa', async () => {
      const { usuario: alumno } = await crearAlumno();
      idsUsuarios.push(alumno.id);
      const { usuarioAdmin, empresa, passwordPlana } = await crearEmpresaConAdmin();
      idsUsuarios.push(usuarioAdmin.id);
      const { usuarioReclutador } = await agregarReclutador(empresa);
      idsUsuarios.push(usuarioReclutador.id);
      const oferta = await crearOferta(empresa, { creadaPorUsuarioId: usuarioReclutador.id });
      const postulacion = await crearPostulacion(alumno, oferta);

      const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);
      const res = await request(app)
        .patch(`/api/postulaciones/${postulacion.id}/estado`)
        .set('Authorization', `Bearer ${token}`)
        .send({ estado: 'preseleccionado' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ROL_INSUFICIENTE');
    });

    test('admin_empresa sí puede ver los candidatos de cualquier oferta de su empresa (solo lectura)', async () => {
      const { usuario: alumno } = await crearAlumno();
      idsUsuarios.push(alumno.id);
      const { usuarioAdmin, empresa, passwordPlana } = await crearEmpresaConAdmin();
      idsUsuarios.push(usuarioAdmin.id);
      const { usuarioReclutador } = await agregarReclutador(empresa);
      idsUsuarios.push(usuarioReclutador.id);
      const oferta = await crearOferta(empresa, { creadaPorUsuarioId: usuarioReclutador.id });
      await crearPostulacion(alumno, oferta);

      const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);
      const res = await request(app)
        .get(`/api/postulaciones/oferta/${oferta.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    test('reclutador puede ver candidatos de una oferta de otro reclutador de su empresa, pero no gestionarlos', async () => {
      const { usuario: alumno } = await crearAlumno();
      idsUsuarios.push(alumno.id);
      const { empresa } = await crearEmpresaConAdmin();
      const { usuarioReclutador: responsable } = await agregarReclutador(empresa);
      idsUsuarios.push(responsable.id);
      const { usuarioReclutador: otro, passwordPlana: passOtro } = await agregarReclutador(empresa);
      idsUsuarios.push(otro.id);
      const oferta = await crearOferta(empresa, { creadaPorUsuarioId: responsable.id });
      const postulacion = await crearPostulacion(alumno, oferta);

      const tokenOtro = await loginYObtenerToken(otro.email, passOtro);

      const ver = await request(app)
        .get(`/api/postulaciones/oferta/${oferta.id}`)
        .set('Authorization', `Bearer ${tokenOtro}`);
      expect(ver.status).toBe(200);

      const gestionar = await request(app)
        .patch(`/api/postulaciones/${postulacion.id}/estado`)
        .set('Authorization', `Bearer ${tokenOtro}`)
        .send({ estado: 'preseleccionado' });
      expect(gestionar.status).toBe(403);
    });

    test('oferta huérfana (sin creadaPorUsuarioId): cualquier reclutador activo de la empresa puede gestionar sus candidatos', async () => {
      const { usuario: alumno } = await crearAlumno();
      idsUsuarios.push(alumno.id);
      const { empresa } = await crearEmpresaConAdmin();
      const { usuarioReclutador, passwordPlana } = await agregarReclutador(empresa);
      idsUsuarios.push(usuarioReclutador.id);
      const ofertaHuerfana = await crearOferta(empresa); // sin creadaPorUsuarioId → NULL
      const postulacion = await crearPostulacion(alumno, ofertaHuerfana);

      const token = await loginYObtenerToken(usuarioReclutador.email, passwordPlana);
      const res = await request(app)
        .patch(`/api/postulaciones/${postulacion.id}/estado`)
        .set('Authorization', `Bearer ${token}`)
        .send({ estado: 'preseleccionado' });

      expect(res.status).toBe(200);
    });
  });
});
