'use strict';
const request = require('supertest');
const app = require('../src/app');
const { Usuario, EmpresaUsuario, Notificacion, ActivityLog, Oferta, SolicitudReclutador } = require('../src/models');
const {
  crearAdmin,
  crearEmpresaConAdmin,
  agregarReclutador,
  loginYObtenerToken,
} = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

describe('EMPRESA CONFIANZA (RBAC-05)', () => {
  const idsUsuarios = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  async function crearAdminSistema() {
    const { usuario, passwordPlana } = await crearAdmin();
    idsUsuarios.push(usuario.id);
    return { admin: usuario, token: await loginYObtenerToken(usuario.email, passwordPlana) };
  }

  // Las notificaciones a admins se disparan fire-and-forget (no bloquean la
  // respuesta HTTP, mismo patrón que notificarAdminsNuevaOferta) — se
  // reintenta la lectura en vez de asumir que ya se escribió apenas vuelve
  // la respuesta del POST/PATCH.
  async function esperarNotificacion(where, intentos = 20, delayMs = 50) {
    for (let i = 0; i < intentos; i++) {
      const notif = await Notificacion.findOne({ where, order: [['id', 'DESC']] });
      if (notif) return notif;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return null;
  }

  // ── Empresa estándar ──────────────────────────────────────────────────────

  test('empresa estándar: solicitar reclutador crea una solicitud pendiente, sin crear la cuenta todavía', async () => {
    const { usuarioAdmin, passwordPlana } = await crearEmpresaConAdmin(); // nivelConfianza default: 'estandar'
    idsUsuarios.push(usuarioAdmin.id);
    const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);

    const email = `nuevo-reclutador-${Date.now()}@test.local`;
    const res = await request(app)
      .post('/api/empresas/equipo/solicitar')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Ana', apellido: 'Reclutadora', email });

    expect(res.status).toBe(201);
    expect(res.body.data.estado).toBe('pendiente');

    const cuentaCreada = await Usuario.findOne({ where: { email } });
    expect(cuentaCreada).toBeNull();
  });

  test('empresa estándar: la solicitud de reclutador pendiente notifica a los admins del sistema', async () => {
    const { admin } = await crearAdminSistema();
    const { usuarioAdmin, empresa, passwordPlana } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);

    const email = `pendiente-notif-${Date.now()}@test.local`;
    const res = await request(app)
      .post('/api/empresas/equipo/solicitar')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Lucía', apellido: 'Ferrari', email });
    expect(res.status).toBe(201);

    const notif = await esperarNotificacion({ usuarioId: admin.id, titulo: 'Nueva solicitud de reclutador' });
    expect(notif).not.toBeNull();
    expect(notif.mensaje).toContain(empresa.razonSocial);
    expect(notif.mensaje).toContain('Lucía Ferrari');
    expect(notif.accionURL).toBe('/admin/solicitudes?tab=reclutadores');
    expect(notif.tipo).toBe('sistema');

    // Nunca además el aviso de alta automática para el mismo evento.
    expect(await Notificacion.count({
      where: { usuarioId: admin.id, titulo: '🤝 Reclutador agregado automáticamente' },
    })).toBe(0);
  });

  test('empresa confiable: NO genera el aviso de solicitud pendiente, solo el de alta automática', async () => {
    const { admin } = await crearAdminSistema();
    const { usuarioAdmin, passwordPlana } = await crearEmpresaConAdmin({ empresa: { nivelConfianza: 'confiable' } });
    idsUsuarios.push(usuarioAdmin.id);
    const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);

    const email = `auto-notif-${Date.now()}@test.local`;
    const res = await request(app)
      .post('/api/empresas/equipo/solicitar')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Tomás', apellido: 'Confiable', email });
    expect(res.status).toBe(201);
    const creado = await Usuario.findOne({ where: { email } });
    if (creado) idsUsuarios.push(creado.id);

    const auto = await esperarNotificacion({ usuarioId: admin.id, titulo: '🤝 Reclutador agregado automáticamente' });
    expect(auto).not.toBeNull();
    await new Promise((r) => setTimeout(r, 150));
    expect(await Notificacion.count({
      where: { usuarioId: admin.id, titulo: 'Nueva solicitud de reclutador' },
    })).toBe(0);
  });

  test('empresa estándar: oferta creada por un reclutador queda pendiente y no visible', async () => {
    const { empresa } = await crearEmpresaConAdmin();
    const { usuarioReclutador, passwordPlana } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);
    const token = await loginYObtenerToken(usuarioReclutador.email, passwordPlana);

    const crear = await request(app)
      .post('/api/ofertas')
      .set('Authorization', `Bearer ${token}`)
      .send({ titulo: 'Pasantía empresa estándar', descripcion: 'Descripción de prueba.' });

    expect(crear.status).toBe(201);
    expect(crear.body.data.estadoModeracion).toBe('pendiente');

    const listado = await request(app).get('/api/ofertas');
    expect(listado.body.data.map((o) => o.id)).not.toContain(crear.body.data.id);
  });

  // ── Empresa confiable ─────────────────────────────────────────────────────

  test('empresa confiable: solicitar reclutador crea la cuenta de inmediato, sin aprobación manual', async () => {
    const { usuarioAdmin, passwordPlana } = await crearEmpresaConAdmin({ empresa: { nivelConfianza: 'confiable' } });
    idsUsuarios.push(usuarioAdmin.id);
    const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);

    const email = `reclutador-confiable-${Date.now()}@test.local`;
    const res = await request(app)
      .post('/api/empresas/equipo/solicitar')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Beto', apellido: 'Confiable', email });

    expect(res.status).toBe(201);
    expect(res.body.data.estado).toBe('aprobado');

    const nuevoUsuario = await Usuario.findOne({ where: { email } });
    expect(nuevoUsuario).not.toBeNull();
    idsUsuarios.push(nuevoUsuario.id);

    const membresia = await EmpresaUsuario.findOne({ where: { usuarioId: nuevoUsuario.id, activo: true } });
    expect(membresia).not.toBeNull();
    expect(membresia.rolInterno).toBe('reclutador');
  });

  test('empresa confiable: oferta creada por un reclutador queda auto_aprobada y visible de inmediato', async () => {
    const { empresa } = await crearEmpresaConAdmin({ empresa: { nivelConfianza: 'confiable' } });
    const { usuarioReclutador, passwordPlana } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);
    const token = await loginYObtenerToken(usuarioReclutador.email, passwordPlana);

    const crear = await request(app)
      .post('/api/ofertas')
      .set('Authorization', `Bearer ${token}`)
      .send({ titulo: 'Pasantía empresa confiable', descripcion: 'Descripción de prueba.' });

    expect(crear.status).toBe(201);
    expect(crear.body.data.estadoModeracion).toBe('auto_aprobada');

    const listado = await request(app).get('/api/ofertas');
    expect(listado.body.data.map((o) => o.id)).toContain(crear.body.data.id);
  });

  test('empresa confiable: el admin del sistema recibe notificación al agregarse un reclutador automáticamente', async () => {
    const { admin } = await crearAdminSistema();
    const { usuarioAdmin, passwordPlana } = await crearEmpresaConAdmin({ empresa: { nivelConfianza: 'confiable' } });
    idsUsuarios.push(usuarioAdmin.id);
    const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);

    const email = `reclutador-notif-${Date.now()}@test.local`;
    const res = await request(app)
      .post('/api/empresas/equipo/solicitar')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Carla', apellido: 'Notificada', email });
    expect(res.status).toBe(201);
    idsUsuarios.push((await Usuario.findOne({ where: { email } })).id);

    const notif = await esperarNotificacion({ usuarioId: admin.id, tipo: 'sistema' });
    expect(notif).not.toBeNull();
    expect(notif.mensaje).toContain('Carla');
  });

  test('empresa confiable: el admin del sistema recibe notificación cuando una oferta se auto-aprueba', async () => {
    const { admin } = await crearAdminSistema();
    const { empresa } = await crearEmpresaConAdmin({ empresa: { nivelConfianza: 'confiable' } });
    const { usuarioReclutador, passwordPlana } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);
    const token = await loginYObtenerToken(usuarioReclutador.email, passwordPlana);

    const crear = await request(app)
      .post('/api/ofertas')
      .set('Authorization', `Bearer ${token}`)
      .send({ titulo: 'Trainee QA', descripcion: 'Descripción de prueba.' });
    expect(crear.status).toBe(201);

    const notif = await esperarNotificacion({ usuarioId: admin.id, tipo: 'oferta' });
    expect(notif).not.toBeNull();
    expect(notif.mensaje).toContain('Trainee QA');
    expect(notif.mensaje).toContain('confianza');
  });

  test('empresa confiable: el admin puede rechazar posteriormente una oferta auto_aprobada', async () => {
    const { token: tokenAdmin } = await crearAdminSistema();
    const { empresa } = await crearEmpresaConAdmin({ empresa: { nivelConfianza: 'confiable' } });
    const { usuarioReclutador, passwordPlana } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);
    const tokenReclutador = await loginYObtenerToken(usuarioReclutador.email, passwordPlana);

    const crear = await request(app)
      .post('/api/ofertas')
      .set('Authorization', `Bearer ${tokenReclutador}`)
      .send({ titulo: 'Oferta a rechazar después', descripcion: 'Descripción de prueba.' });
    expect(crear.body.data.estadoModeracion).toBe('auto_aprobada');

    const rechazar = await request(app)
      .patch(`/api/admin/ofertas/${crear.body.data.id}/moderar`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ accion: 'rechazar' });

    expect(rechazar.status).toBe(200);
    expect(rechazar.body.data.estadoModeracion).toBe('rechazada');
  });

  // ── Admin: marcar / revocar confianza ─────────────────────────────────────

  test('admin marca una empresa estándar como confiable', async () => {
    const { token } = await crearAdminSistema();
    const { usuarioAdmin, empresa } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);

    const res = await request(app)
      .patch(`/api/admin/empresas/${empresa.id}/confianza`)
      .set('Authorization', `Bearer ${token}`)
      .send({ accion: 'marcar' });

    expect(res.status).toBe(200);
    expect(res.body.data.nivelConfianza).toBe('confiable');

    const log = await ActivityLog.findOne({
      where: { accion: 'marcar_empresa_confiable', entidad: 'empresa', entidadId: empresa.id },
    });
    expect(log).not.toBeNull();
  });

  test('admin puede revocar la confianza de una empresa confiable', async () => {
    const { token } = await crearAdminSistema();
    const { usuarioAdmin, empresa } = await crearEmpresaConAdmin({ empresa: { nivelConfianza: 'confiable' } });
    idsUsuarios.push(usuarioAdmin.id);

    const res = await request(app)
      .patch(`/api/admin/empresas/${empresa.id}/confianza`)
      .set('Authorization', `Bearer ${token}`)
      .send({ accion: 'revocar' });

    expect(res.status).toBe(200);
    expect(res.body.data.nivelConfianza).toBe('estandar');

    const log = await ActivityLog.findOne({
      where: { accion: 'revocar_confianza_empresa', entidad: 'empresa', entidadId: empresa.id },
    });
    expect(log).not.toBeNull();
  });

  test('marcar una empresa ya confiable devuelve 400', async () => {
    const { token } = await crearAdminSistema();
    const { usuarioAdmin, empresa } = await crearEmpresaConAdmin({ empresa: { nivelConfianza: 'confiable' } });
    idsUsuarios.push(usuarioAdmin.id);

    const res = await request(app)
      .patch(`/api/admin/empresas/${empresa.id}/confianza`)
      .set('Authorization', `Bearer ${token}`)
      .send({ accion: 'marcar' });

    expect(res.status).toBe(400);
  });

  test('un rol no-admin no puede cambiar el nivel de confianza de una empresa', async () => {
    const { usuarioAdmin, empresa, passwordPlana } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);

    const res = await request(app)
      .patch(`/api/admin/empresas/${empresa.id}/confianza`)
      .set('Authorization', `Bearer ${token}`)
      .send({ accion: 'marcar' });

    expect(res.status).toBe(403);
  });

  test('GET /api/admin/empresas filtra por nivelConfianza', async () => {
    const { token } = await crearAdminSistema();
    const { usuarioAdmin: adminEstandar, empresa: empresaEstandar } = await crearEmpresaConAdmin();
    idsUsuarios.push(adminEstandar.id);
    const { usuarioAdmin: adminConfiable, empresa: empresaConfiable } = await crearEmpresaConAdmin({ empresa: { nivelConfianza: 'confiable' } });
    idsUsuarios.push(adminConfiable.id);

    const res = await request(app)
      .get('/api/admin/empresas')
      .set('Authorization', `Bearer ${token}`)
      .query({ nivelConfianza: 'confiable' });

    expect(res.status).toBe(200);
    const ids = res.body.data.map((e) => e.id);
    expect(ids).toContain(empresaConfiable.id);
    expect(ids).not.toContain(empresaEstandar.id);
  });

  // ── Revocación no retroactiva ─────────────────────────────────────────────

  test('revocar la confianza no modifica retroactivamente una oferta ya auto_aprobada, y las operaciones nuevas usan la política estándar', async () => {
    const { token: tokenAdmin } = await crearAdminSistema();
    const { usuarioAdmin, empresa, passwordPlana: passAdminEmpresa } = await crearEmpresaConAdmin({ empresa: { nivelConfianza: 'confiable' } });
    idsUsuarios.push(usuarioAdmin.id);
    const { usuarioReclutador, passwordPlana: passReclutador } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);
    const tokenReclutador = await loginYObtenerToken(usuarioReclutador.email, passReclutador);
    const tokenAdminEmpresa = await loginYObtenerToken(usuarioAdmin.email, passAdminEmpresa);

    // Oferta creada MIENTRAS la empresa es confiable.
    const ofertaVieja = await request(app)
      .post('/api/ofertas')
      .set('Authorization', `Bearer ${tokenReclutador}`)
      .send({ titulo: 'Oferta previa a la revocación', descripcion: 'Descripción de prueba.' });
    expect(ofertaVieja.body.data.estadoModeracion).toBe('auto_aprobada');

    // Revocar confianza.
    const revocar = await request(app)
      .patch(`/api/admin/empresas/${empresa.id}/confianza`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ accion: 'revocar' });
    expect(revocar.status).toBe(200);

    // La oferta vieja no se tocó retroactivamente.
    const ofertaFresca = await Oferta.findByPk(ofertaVieja.body.data.id, { attributes: ['estadoModeracion'] });
    expect(ofertaFresca.estadoModeracion).toBe('auto_aprobada');

    // Una oferta nueva, creada DESPUÉS de revocar, vuelve a nacer pendiente.
    const ofertaNueva = await request(app)
      .post('/api/ofertas')
      .set('Authorization', `Bearer ${tokenReclutador}`)
      .send({ titulo: 'Oferta posterior a la revocación', descripcion: 'Descripción de prueba.' });
    expect(ofertaNueva.body.data.estadoModeracion).toBe('pendiente');

    // Una solicitud de reclutador nueva, creada después de revocar, vuelve a quedar pendiente.
    const email = `reclutador-post-revocacion-${Date.now()}@test.local`;
    const solicitudNueva = await request(app)
      .post('/api/empresas/equipo/solicitar')
      .set('Authorization', `Bearer ${tokenAdminEmpresa}`)
      .send({ nombre: 'Diego', apellido: 'Postrevocacion', email });
    expect(solicitudNueva.status).toBe(201);
    expect(solicitudNueva.body.data.estado).toBe('pendiente');

    const cuentaNoCreada = await Usuario.findOne({ where: { email } });
    expect(cuentaNoCreada).toBeNull();

    const solicitudEnBd = await SolicitudReclutador.findByPk(solicitudNueva.body.data.id, { attributes: ['estado'] });
    expect(solicitudEnBd.estado).toBe('pendiente');
  });
});
