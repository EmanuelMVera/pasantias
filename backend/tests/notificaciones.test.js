'use strict';
const request = require('supertest');
const app = require('../src/app');
const { Op } = require('sequelize');
const { crearAlumno, crearAdmin, loginYObtenerToken, cuitValido } = require('./helpers/factories');
const { limpiarUsuarios, limpiarSolicitudesEmpresa, cerrarConexion } = require('./helpers/cleanup');
const { Notificacion } = require('../src/models');

// Las notificaciones a admins son fire-and-forget: se reintenta la lectura.
async function esperarNotificacion(where, intentos = 30, delayMs = 50) {
  for (let i = 0; i < intentos; i++) {
    const notif = await Notificacion.findOne({ where, order: [['id', 'DESC']] });
    if (notif) return notif;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

describe('NOTIFICACIONES', () => {
  const idsUsuarios = [];
  const idsSolicitudes = [];

  afterAll(async () => {
    await limpiarSolicitudesEmpresa(idsSolicitudes);
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  async function crearNotif(usuarioId, leida, titulo = 'Notif de prueba') {
    return Notificacion.create({ usuarioId, titulo, mensaje: 'Mensaje de prueba.', tipo: 'sistema', leida });
  }

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

  // ── DELETE /api/notificaciones/leidas ──────────────────────────────────────
  test('eliminar leídas: borra solo las leídas propias, conserva las no leídas y las de otros', async () => {
    const { usuario: a, passwordPlana } = await crearAlumno();
    idsUsuarios.push(a.id);
    const { usuario: b } = await crearAlumno();
    idsUsuarios.push(b.id);

    const leidasA = await Promise.all([crearNotif(a.id, true), crearNotif(a.id, true), crearNotif(a.id, true)]);
    const pendientesA = await Promise.all([crearNotif(a.id, false), crearNotif(a.id, false)]);
    const leidaB = await crearNotif(b.id, true);
    const pendienteB = await crearNotif(b.id, false);

    const tokenA = await loginYObtenerToken(a.email, passwordPlana);
    const res = await request(app)
      .delete('/api/notificaciones/leidas')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, eliminadas: 3 });

    expect(await Notificacion.count({ where: { id: leidasA.map((n) => n.id) } })).toBe(0);
    expect(await Notificacion.count({ where: { id: pendientesA.map((n) => n.id) } })).toBe(2);
    // Aislamiento entre usuarios: nada de B se toca (ni leídas ni no leídas).
    expect(await Notificacion.findByPk(leidaB.id)).not.toBeNull();
    expect(await Notificacion.findByPk(pendienteB.id)).not.toBeNull();
  });

  test('eliminar leídas sin leídas devuelve eliminadas: 0 y no toca las pendientes', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);
    const pendiente = await crearNotif(usuario.id, false);
    const token = await loginYObtenerToken(usuario.email, passwordPlana);

    const res = await request(app).delete('/api/notificaciones/leidas').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.eliminadas).toBe(0);
    expect(await Notificacion.findByPk(pendiente.id)).not.toBeNull();
  });

  test('eliminar leídas exige autenticación', async () => {
    const res = await request(app).delete('/api/notificaciones/leidas');
    expect(res.status).toBe(401);
  });

  // ── Nueva solicitud de empresa → admins del sistema ────────────────────────
  test('POST /api/solicitudes-empresa notifica a los admins activos (y a nadie más)', async () => {
    const { usuario: admin } = await crearAdmin();
    idsUsuarios.push(admin.id);
    const { usuario: adminInactivo } = await crearAdmin({ activo: false });
    idsUsuarios.push(adminInactivo.id);
    const { usuario: alumno } = await crearAlumno();
    idsUsuarios.push(alumno.id);

    const suf = Date.now();
    const razonSocial = `NubeCode Test ${suf} SRL`;
    const res = await request(app).post('/api/solicitudes-empresa').send({
      razonSocial,
      cuit: cuitValido(),
      rubro: 'Software',
      email: `contacto-${suf}@test.local`,
      responsableNombre: 'Rocío',
      responsableApellido: 'Prueba',
      responsableEmail: `responsable-${suf}@test.local`,
    });
    expect(res.status).toBe(201);
    idsSolicitudes.push(res.body.data.id);

    const notif = await esperarNotificacion({ usuarioId: admin.id, titulo: 'Nueva solicitud de empresa' });
    expect(notif).not.toBeNull();
    expect(notif.mensaje).toContain(razonSocial);
    expect(notif.accionURL).toBe('/admin/solicitudes');
    expect(notif.tipo).toBe('sistema');
    expect(notif.leida).toBe(false);

    expect(await Notificacion.count({ where: { usuarioId: adminInactivo.id } })).toBe(0);
    expect(await Notificacion.count({ where: { usuarioId: alumno.id } })).toBe(0);
  });

  test('una solicitud de empresa inválida no crea notificaciones', async () => {
    const { usuario: admin } = await crearAdmin();
    idsUsuarios.push(admin.id);
    const res = await request(app).post('/api/solicitudes-empresa').send({ razonSocial: 'Incompleta SA' });
    expect(res.status).toBe(400);
    await new Promise((r) => setTimeout(r, 200));
    expect(await Notificacion.count({
      where: { usuarioId: admin.id, titulo: { [Op.like]: 'Nueva solicitud%' } },
    })).toBe(0);
  });
});
