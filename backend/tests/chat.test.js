'use strict';
const request = require('supertest');
const app = require('../src/app');
const { Mensaje } = require('../src/models');
const {
  crearAlumno,
  crearAdmin,
  crearEmpresaConAdmin,
  agregarReclutador,
  crearOferta,
  crearPostulacion,
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

  test('admin no puede usar el chat como emisor (bloqueado a nivel de ruta)', async () => {
    const { usuario: admin, passwordPlana } = await crearAdmin();
    idsUsuarios.push(admin.id);
    const { usuario: alumno } = await crearAlumno();
    idsUsuarios.push(alumno.id);

    const token = await loginYObtenerToken(admin.email, passwordPlana);

    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ receptorId: alumno.id, mensaje: 'Hola' });

    expect(res.status).toBe(403);
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

  test('alumno ↔ alumno bloqueado', async () => {
    const { usuario: alumno1, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno1.id);
    const { usuario: alumno2 } = await crearAlumno();
    idsUsuarios.push(alumno2.id);

    const token = await loginYObtenerToken(alumno1.email, passwordPlana);

    const historial = await request(app)
      .get(`/api/chat/${alumno2.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(historial.status).toBe(403);

    const envio = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ receptorId: alumno2.id, mensaje: 'Hola compañero' });
    expect(envio.status).toBe(403);
  });

  test('alumno ↔ reclutador sin postulación bloqueado', async () => {
    const { usuario: alumno, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const { empresa } = await crearEmpresaConAdmin();
    const { usuarioReclutador } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);

    const token = await loginYObtenerToken(alumno.email, passwordPlana);

    const historial = await request(app)
      .get(`/api/chat/${usuarioReclutador.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(historial.status).toBe(403);

    const envio = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ receptorId: usuarioReclutador.id, mensaje: 'Hola, ¿podemos hablar?' });
    expect(envio.status).toBe(403);
  });

  test('alumno ↔ admin_empresa sin relación bloqueado (el contacto de selección es el reclutador)', async () => {
    const { usuario: alumno, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const { usuarioAdmin } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);

    const token = await loginYObtenerToken(alumno.email, passwordPlana);

    const historial = await request(app)
      .get(`/api/chat/${usuarioAdmin.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(historial.status).toBe(403);

    const envio = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ receptorId: usuarioAdmin.id, mensaje: 'Hola' });
    expect(envio.status).toBe(403);
  });

  test('en_revision bloquea envío y lectura', async () => {
    const { usuario: alumno, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const { empresa } = await crearEmpresaConAdmin();
    const { usuarioReclutador } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);
    const oferta = await crearOferta(empresa, { creadaPorUsuarioId: usuarioReclutador.id });
    await crearPostulacion(alumno, oferta); // estado default: en_revision

    const token = await loginYObtenerToken(alumno.email, passwordPlana);

    const envio = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ receptorId: usuarioReclutador.id, mensaje: 'Hola' });
    expect(envio.status).toBe(403);

    const historial = await request(app)
      .get(`/api/chat/${usuarioReclutador.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(historial.status).toBe(403);
  });

  test('preseleccionado permite envío y el historial identifica al reclutador (no admin_empresa)', async () => {
    const { usuario: alumno, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const { empresa } = await crearEmpresaConAdmin();
    const { usuarioReclutador } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);
    const oferta = await crearOferta(empresa, { creadaPorUsuarioId: usuarioReclutador.id });
    await crearPostulacion(alumno, oferta, { estado: 'preseleccionado' });

    const token = await loginYObtenerToken(alumno.email, passwordPlana);

    const envio = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ receptorId: usuarioReclutador.id, mensaje: 'Hola, ¿la pasantía sigue abierta?' });
    expect(envio.status).toBe(201);

    const historial = await request(app)
      .get(`/api/chat/${usuarioReclutador.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(historial.status).toBe(200);
    expect(historial.body.data.length).toBe(1);
    expect(historial.body.soloLectura).toBe(false);
    expect(historial.body.usuario.rolInterno).toBe('reclutador');
    expect(historial.body.usuario.razonSocial).toBe(empresa.razonSocial);
  });

  test('entrevista permite envío', async () => {
    const { usuario: alumno, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const { empresa } = await crearEmpresaConAdmin();
    const { usuarioReclutador } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);
    const oferta = await crearOferta(empresa, { creadaPorUsuarioId: usuarioReclutador.id });
    await crearPostulacion(alumno, oferta, { estado: 'entrevista' });

    const token = await loginYObtenerToken(alumno.email, passwordPlana);

    const envio = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ receptorId: usuarioReclutador.id, mensaje: 'Confirmo el horario de la entrevista.' });
    expect(envio.status).toBe(201);
  });

  test('contratado permite envío', async () => {
    const { usuario: alumno, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const { empresa } = await crearEmpresaConAdmin();
    const { usuarioReclutador } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);
    const oferta = await crearOferta(empresa, { creadaPorUsuarioId: usuarioReclutador.id });
    await crearPostulacion(alumno, oferta, { estado: 'contratado' });

    const token = await loginYObtenerToken(alumno.email, passwordPlana);

    const envio = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ receptorId: usuarioReclutador.id, mensaje: '¡Gracias por la oportunidad!' });
    expect(envio.status).toBe(201);
  });

  test('rechazado permite ver el historial pero bloquea mensajes nuevos', async () => {
    const { usuario: alumno, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const { empresa } = await crearEmpresaConAdmin();
    const { usuarioReclutador } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);
    const oferta = await crearOferta(empresa, { creadaPorUsuarioId: usuarioReclutador.id });
    const postulacion = await crearPostulacion(alumno, oferta, { estado: 'preseleccionado' });

    const token = await loginYObtenerToken(alumno.email, passwordPlana);

    const envioPrevio = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ receptorId: usuarioReclutador.id, mensaje: 'Hola, quedo atento.' });
    expect(envioPrevio.status).toBe(201);

    await postulacion.update({ estado: 'rechazado' });

    const historial = await request(app)
      .get(`/api/chat/${usuarioReclutador.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(historial.status).toBe(200);
    expect(historial.body.data.length).toBe(1);
    expect(historial.body.soloLectura).toBe(true);
    expect(historial.body.motivoSoloLectura).toBeTruthy();

    const envioNuevo = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ receptorId: usuarioReclutador.id, mensaje: 'Otra consulta.' });
    expect(envioNuevo.status).toBe(403);
  });

  test('reclutador de otra empresa bloqueado', async () => {
    const { usuario: alumno, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const { empresa: empresaA } = await crearEmpresaConAdmin();
    const { usuarioReclutador: reclutadorA } = await agregarReclutador(empresaA);
    idsUsuarios.push(reclutadorA.id);
    const ofertaA = await crearOferta(empresaA, { creadaPorUsuarioId: reclutadorA.id });
    await crearPostulacion(alumno, ofertaA, { estado: 'preseleccionado' });

    const { empresa: empresaB } = await crearEmpresaConAdmin();
    const { usuarioReclutador: reclutadorB } = await agregarReclutador(empresaB);
    idsUsuarios.push(reclutadorB.id);

    const token = await loginYObtenerToken(alumno.email, passwordPlana);

    const historial = await request(app)
      .get(`/api/chat/${reclutadorB.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(historial.status).toBe(403);

    const envio = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ receptorId: reclutadorB.id, mensaje: 'Hola' });
    expect(envio.status).toBe(403);
  });

  test('reclutador de la misma empresa pero de una oferta de otro reclutador no accede al candidato como propio', async () => {
    const { usuario: alumno, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const { empresa } = await crearEmpresaConAdmin();
    const { usuarioReclutador: reclutadorResponsable } = await agregarReclutador(empresa);
    idsUsuarios.push(reclutadorResponsable.id);
    const { usuarioReclutador: otroReclutador } = await agregarReclutador(empresa);
    idsUsuarios.push(otroReclutador.id);

    const oferta = await crearOferta(empresa, { creadaPorUsuarioId: reclutadorResponsable.id });
    await crearPostulacion(alumno, oferta, { estado: 'preseleccionado' });

    const tokenOtro = await loginYObtenerToken(otroReclutador.email, passwordPlana);

    const historial = await request(app)
      .get(`/api/chat/${alumno.id}`)
      .set('Authorization', `Bearer ${tokenOtro}`);
    expect(historial.status).toBe(403);
  });

  test('oferta sin responsable: no habilita el chat con ningún reclutador hasta que se le asigne uno', async () => {
    const { usuario: alumno, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const { empresa } = await crearEmpresaConAdmin();
    const { usuarioReclutador } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);

    const ofertaHuerfana = await crearOferta(empresa); // sin creadaPorUsuarioId → NULL
    await crearPostulacion(alumno, ofertaHuerfana, { estado: 'preseleccionado' });

    const token = await loginYObtenerToken(alumno.email, passwordPlana);

    const envio = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ receptorId: usuarioReclutador.id, mensaje: 'Hola' });
    expect(envio.status).toBe(403);

    // Al asignarle responsable, el chat queda habilitado con ESE reclutador.
    await ofertaHuerfana.update({ creadaPorUsuarioId: usuarioReclutador.id });
    const envio2 = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ receptorId: usuarioReclutador.id, mensaje: 'Hola' });
    expect(envio2.status).toBe(201);
  });

  test('miembros de una misma empresa pueden chatear entre sí', async () => {
    const { usuarioAdmin, empresa, passwordPlana } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const { usuarioReclutador } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);

    const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);

    const envio = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ receptorId: usuarioReclutador.id, mensaje: 'Bienvenido al equipo' });
    expect(envio.status).toBe(201);

    const historial = await request(app)
      .get(`/api/chat/${usuarioReclutador.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(historial.status).toBe(200);
    expect(historial.body.soloLectura).toBe(false);
  });

  test('marcarLeida rechaza un par sin relación válida (regresión IDOR)', async () => {
    const { usuario: alumno1, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno1.id);
    const { usuario: alumno2 } = await crearAlumno();
    idsUsuarios.push(alumno2.id);

    const token = await loginYObtenerToken(alumno1.email, passwordPlana);

    const res = await request(app)
      .patch(`/api/chat/${alumno2.id}/leer`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('obtenerConversaciones oculta un par legacy que las reglas actuales ya no habilitan', async () => {
    const { usuario: alumno1, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno1.id);
    const { usuario: alumno2 } = await crearAlumno();
    idsUsuarios.push(alumno2.id);

    // Inserción directa (bypass del controller) simulando un mensaje legacy
    // de antes de esta regla, entre dos alumnos.
    await Mensaje.create({ emisorId: alumno1.id, receptorId: alumno2.id, mensaje: 'Mensaje legacy' });

    const token = await loginYObtenerToken(alumno1.email, passwordPlana);

    const res = await request(app)
      .get('/api/chat')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const idsConversaciones = res.body.data.map((c) => c.usuario.id);
    expect(idsConversaciones).not.toContain(alumno2.id);
  });
});
