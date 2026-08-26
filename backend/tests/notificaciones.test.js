'use strict';
const request = require('supertest');
const app = require('../src/app');
const { crearAlumno, loginYObtenerToken } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');
const { Notificacion } = require('../src/models');

describe('NOTIFICACIONES', () => {
  const idsUsuarios = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  test('usuario no puede marcar como leída la notificación de otro por id-guessing', async () => {
    const { usuario: usuarioA, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuarioA.id);
    const { usuario: usuarioB } = await crearAlumno();
    idsUsuarios.push(usuarioB.id);

    const notifDeB = await Notificacion.create({
      usuarioId: usuarioB.id,
      titulo: 'Notificación de B',
      mensaje: 'No debería poder tocarla A.',
      tipo: 'sistema',
      leida: false,
    });

    const tokenA = await loginYObtenerToken(usuarioA.email, passwordPlana);

    const res = await request(app)
      .patch(`/api/notificaciones/${notifDeB.id}/leer`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);

    const recargada = await Notificacion.findByPk(notifDeB.id);
    expect(recargada.leida).toBe(false);
  });

  test('usuario no puede eliminar la notificación de otro por id-guessing', async () => {
    const { usuario: usuarioA, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuarioA.id);
    const { usuario: usuarioB } = await crearAlumno();
    idsUsuarios.push(usuarioB.id);

    const notifDeB = await Notificacion.create({
      usuarioId: usuarioB.id,
      titulo: 'Notificación de B',
      mensaje: 'No debería poder borrarla A.',
      tipo: 'sistema',
      leida: false,
    });

    const tokenA = await loginYObtenerToken(usuarioA.email, passwordPlana);

    const res = await request(app)
      .delete(`/api/notificaciones/${notifDeB.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);

    const sigueExistiendo = await Notificacion.findByPk(notifDeB.id);
    expect(sigueExistiendo).not.toBeNull();
  });
});
