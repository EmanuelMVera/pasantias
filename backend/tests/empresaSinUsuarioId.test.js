'use strict';
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const app = require('../src/app');
const { Usuario, EmpresaUsuario, Notificacion, SolicitudReclutador } = require('../src/models');
const {
  crearAdmin,
  crearAlumno,
  crearEmpresaConAdmin,
  agregarReclutador,
  crearOferta,
  crearSolicitudEmpresaPendiente,
  loginYObtenerToken,
} = require('./helpers/factories');
const { limpiarUsuarios, limpiarSolicitudesEmpresa, cerrarConexion } = require('./helpers/cleanup');

// RBAC-06 (migración 019): `empresa_usuarios` es la única fuente de verdad de
// quién representa a una empresa — `Empresa.usuarioId` ya no existe. Esta
// suite cubre exactamente lo pedido: que no exista ningún fallback directo,
// que el middleware/equipo/notificaciones sigan funcionando para ambos
// roles, y que las solicitudes de empresa/reclutador funcionen de punta a
// punta con el nuevo modelo.
describe('EMPRESA SIN usuarioId (RBAC-06)', () => {
  const idsUsuarios = [];
  const idsSolicitudes = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await limpiarSolicitudesEmpresa(idsSolicitudes);
    await cerrarConexion();
  });

  async function crearAdminSistema() {
    const { usuario, passwordPlana } = await crearAdmin();
    idsUsuarios.push(usuario.id);
    return { admin: usuario, token: await loginYObtenerToken(usuario.email, passwordPlana) };
  }

  // Mismo patrón que empresaConfianza.test.js: las notificaciones se crean
  // fire-and-forget, sin await en el controller/service — hay que
  // reintentar la lectura en vez de asumir que ya se escribió.
  async function esperarNotificacion(where, intentos = 20, delayMs = 50) {
    for (let i = 0; i < intentos; i++) {
      const notif = await Notificacion.findOne({ where, order: [['id', 'DESC']] });
      if (notif) return notif;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return null;
  }

  // ── No existe fallback directo ────────────────────────────────────────────

  test('un usuario rol empresa sin fila en empresa_usuarios no tiene acceso a ninguna empresa (404 SIN_EMPRESA)', async () => {
    // Usuario rol 'empresa' creado directo contra el modelo, sin pasar por
    // ningún flujo de alta — antes de la migración 019 esto podía terminar
    // resolviendo una empresa igual si `Empresa.usuarioId` coincidía; ahora
    // no hay ninguna forma de que eso pase.
    const huerfano = await Usuario.create({
      nombre: 'Huerfano', apellido: 'SinEmpresa',
      email: `huerfano-${Date.now()}@test.local`,
      password: await bcrypt.hash('Test1234!', 4),
      rol: 'empresa', activo: true, habilitado: true,
    });
    idsUsuarios.push(huerfano.id);
    const tokenHuerfano = await loginYObtenerToken(huerfano.email, 'Test1234!');

    const res = await request(app)
      .get('/api/empresas/mi-empresa')
      .set('Authorization', `Bearer ${tokenHuerfano}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SIN_EMPRESA');
  });

  // ── verifyEmpresaMember funciona igual para ambos roles ──────────────────

  test('verifyEmpresaMember resuelve req.empresa/req.miembroEmpresa tanto para admin_empresa como para reclutador', async () => {
    const { usuarioAdmin, empresa, passwordPlana: passAdmin } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const { usuarioReclutador, passwordPlana: passReclutador } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);

    const tokenAdmin = await loginYObtenerToken(usuarioAdmin.email, passAdmin);
    const tokenReclutador = await loginYObtenerToken(usuarioReclutador.email, passReclutador);

    const resAdmin = await request(app)
      .get('/api/empresas/mi-empresa')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(resAdmin.status).toBe(200);
    expect(resAdmin.body.data.id).toBe(empresa.id);
    expect(resAdmin.body.rolEnEquipo).toBe('admin_empresa');

    const resReclutador = await request(app)
      .get('/api/empresas/mi-empresa')
      .set('Authorization', `Bearer ${tokenReclutador}`);
    expect(resReclutador.status).toBe(200);
    expect(resReclutador.body.data.id).toBe(empresa.id);
    expect(resReclutador.body.rolEnEquipo).toBe('reclutador');
  });

  // ── Equipo ─────────────────────────────────────────────────────────────

  test('GET /api/empresas/equipo devuelve al admin_empresa real (no virtual) junto con los reclutadores', async () => {
    const { usuarioAdmin, empresa, passwordPlana } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const { usuarioReclutador } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);
    const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);

    const res = await request(app)
      .get('/api/empresas/equipo')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);

    const filaAdmin = res.body.data.find((m) => m.usuario?.id === usuarioAdmin.id);
    expect(filaAdmin).toBeDefined();
    expect(filaAdmin.rolInterno).toBe('admin_empresa');
    expect(filaAdmin.esAdminVirtual).toBeUndefined();

    const filaReclutador = res.body.data.find((m) => m.usuario?.id === usuarioReclutador.id);
    expect(filaReclutador).toBeDefined();
    expect(filaReclutador.rolInterno).toBe('reclutador');
  });

  // ── Notificaciones llegan al admin_empresa ────────────────────────────────

  test('al aprobar una solicitud de reclutador, el admin_empresa recibe notificación', async () => {
    const { token: tokenAdminSistema } = await crearAdminSistema();
    const { usuarioAdmin, empresa, passwordPlana } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);

    const email = `reclutador-notif-rbac06-${Date.now()}@test.local`;
    const solicitud = await SolicitudReclutador.create({
      empresaId: empresa.id, nombre: 'Nueva', apellido: 'Reclutadora', email, estado: 'pendiente',
    });

    const res = await request(app)
      .patch(`/api/admin/solicitudes-reclutador/${solicitud.id}/aprobar`)
      .set('Authorization', `Bearer ${tokenAdminSistema}`);
    expect(res.status).toBe(200);
    idsUsuarios.push(res.body.data.usuarioId);

    const notif = await esperarNotificacion({ usuarioId: usuarioAdmin.id, tipo: 'sistema' });
    expect(notif).not.toBeNull();
    expect(notif.titulo).toContain('aprobada');

    // Login de admin_empresa sigue funcionando después de todo esto.
    const loginAdmin = await request(app).post('/api/auth/login').send({ email: usuarioAdmin.email, password: passwordPlana });
    expect(loginAdmin.status).toBe(200);
  });

  test('al aprobar/rechazar/pausar/cerrar una oferta, el admin_empresa recibe notificación', async () => {
    const { token: tokenAdminSistema } = await crearAdminSistema();
    const { usuarioAdmin, empresa } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);

    const ofertaPendiente = await crearOferta(empresa, { estado: 'activa', estadoModeracion: 'pendiente' });
    const aprobar = await request(app)
      .patch(`/api/admin/ofertas/${ofertaPendiente.id}/moderar`)
      .set('Authorization', `Bearer ${tokenAdminSistema}`)
      .send({ accion: 'aprobar' });
    expect(aprobar.status).toBe(200);
    const notifAprobar = await esperarNotificacion({ usuarioId: usuarioAdmin.id, tipo: 'oferta' });
    expect(notifAprobar).not.toBeNull();

    const ofertaActiva = await crearOferta(empresa, { estado: 'activa', estadoModeracion: 'aprobada' });
    const pausar = await request(app)
      .patch(`/api/admin/ofertas/${ofertaActiva.id}/moderar`)
      .set('Authorization', `Bearer ${tokenAdminSistema}`)
      .send({ accion: 'pausar' });
    expect(pausar.status).toBe(200);
    const notifPausar = await esperarNotificacion({ usuarioId: usuarioAdmin.id, tipo: 'oferta', titulo: { [Op.like]: '%pausada%' } });
    expect(notifPausar).not.toBeNull();

    const cerrar = await request(app)
      .patch(`/api/admin/ofertas/${ofertaActiva.id}/moderar`)
      .set('Authorization', `Bearer ${tokenAdminSistema}`)
      .send({ accion: 'cerrar' });
    expect(cerrar.status).toBe(200);
    const notifCerrar = await esperarNotificacion({ usuarioId: usuarioAdmin.id, tipo: 'oferta', titulo: { [Op.like]: '%cerrada%' } });
    expect(notifCerrar).not.toBeNull();

    const ofertaParaRechazar = await crearOferta(empresa, { estado: 'activa', estadoModeracion: 'pendiente' });
    const rechazar = await request(app)
      .patch(`/api/admin/ofertas/${ofertaParaRechazar.id}/moderar`)
      .set('Authorization', `Bearer ${tokenAdminSistema}`)
      .send({ accion: 'rechazar' });
    expect(rechazar.status).toBe(200);
    const notifRechazar = await esperarNotificacion({ usuarioId: usuarioAdmin.id, tipo: 'oferta', titulo: { [Op.like]: '%rechazada%' } });
    expect(notifRechazar).not.toBeNull();
  });

  test('al recibir una nueva postulación, el admin_empresa recibe notificación', async () => {
    const { usuario: alumno, passwordPlana: passAlumno } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const { usuarioAdmin, empresa } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const oferta = await crearOferta(empresa);

    const tokenAlumno = await loginYObtenerToken(alumno.email, passAlumno);
    const res = await request(app)
      .post('/api/postulaciones')
      .set('Authorization', `Bearer ${tokenAlumno}`)
      .send({ ofertaId: oferta.id });
    expect(res.status).toBe(201);

    const notif = await esperarNotificacion({ usuarioId: usuarioAdmin.id, tipo: 'postulacion' });
    expect(notif).not.toBeNull();
  });

  // ── Solicitudes de empresa/reclutador de punta a punta ────────────────────

  test('solicitud de empresa aprobada: el responsable puede loguearse y ya tiene su empresa con membresía admin_empresa', async () => {
    const { token: tokenAdminSistema } = await crearAdminSistema();
    const solicitud = await crearSolicitudEmpresaPendiente();
    idsSolicitudes.push(solicitud.id);

    const aprobar = await request(app)
      .patch(`/api/admin/solicitudes-empresa/${solicitud.id}/aprobar`)
      .set('Authorization', `Bearer ${tokenAdminSistema}`);
    expect(aprobar.status).toBe(200);
    const { usuarioId, empresaId, passwordGenerada } = aprobar.body.data;
    idsUsuarios.push(usuarioId);

    const membresia = await EmpresaUsuario.findOne({ where: { empresaId, usuarioId, rolInterno: 'admin_empresa', activo: true } });
    expect(membresia).not.toBeNull();

    const usuarioCreado = await Usuario.findByPk(usuarioId);
    const login = await request(app).post('/api/auth/login').send({ email: usuarioCreado.email, password: passwordGenerada });
    expect(login.status).toBe(200);

    const miEmpresa = await request(app)
      .get('/api/empresas/mi-empresa')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(miEmpresa.status).toBe(200);
    expect(miEmpresa.body.data.id).toBe(empresaId);
  });

  test('solicitud de reclutador aprobada: el reclutador puede loguearse y queda vinculado a la empresa correcta', async () => {
    const { token: tokenAdminSistema } = await crearAdminSistema();
    const { usuarioAdmin, empresa } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);

    const email = `reclutador-e2e-rbac06-${Date.now()}@test.local`;
    const solicitud = await SolicitudReclutador.create({
      empresaId: empresa.id, nombre: 'Login', apellido: 'Reclutador', email, estado: 'pendiente',
    });

    const aprobar = await request(app)
      .patch(`/api/admin/solicitudes-reclutador/${solicitud.id}/aprobar`)
      .set('Authorization', `Bearer ${tokenAdminSistema}`);
    expect(aprobar.status).toBe(200);
    const { usuarioId, passwordGenerada } = aprobar.body.data;
    idsUsuarios.push(usuarioId);

    const login = await request(app).post('/api/auth/login').send({ email, password: passwordGenerada });
    expect(login.status).toBe(200);

    const miEmpresa = await request(app)
      .get('/api/empresas/mi-empresa')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(miEmpresa.status).toBe(200);
    expect(miEmpresa.body.data.id).toBe(empresa.id);
    expect(miEmpresa.body.rolEnEquipo).toBe('reclutador');
  });

  // ── Smoke tests de login ──────────────────────────────────────────────────

  test('login funciona para admin_empresa y para reclutador', async () => {
    const { usuarioAdmin, empresa, passwordPlana: passAdmin } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const { usuarioReclutador, passwordPlana: passReclutador } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);

    const loginAdmin = await request(app).post('/api/auth/login').send({ email: usuarioAdmin.email, password: passAdmin });
    expect(loginAdmin.status).toBe(200);
    expect(loginAdmin.body.token).toBeDefined();

    const loginReclutador = await request(app).post('/api/auth/login').send({ email: usuarioReclutador.email, password: passReclutador });
    expect(loginReclutador.status).toBe(200);
    expect(loginReclutador.body.token).toBeDefined();
  });
});
