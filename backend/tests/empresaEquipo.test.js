'use strict';
const request = require('supertest');
const app = require('../src/app');
const {
  crearEmpresaConAdmin,
  agregarReclutador,
  loginYObtenerToken,
} = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

describe('EMPRESA EQUIPO', () => {
  const idsUsuarios = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  test('admin_empresa no puede desvincularse a sí mismo', async () => {
    const { usuarioAdmin, membresia, passwordPlana } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);

    const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);

    const res = await request(app)
      .delete(`/api/empresas/equipo/${membresia.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('admin de empresa B no puede suspender un reclutador de empresa A', async () => {
    const { usuarioAdmin: adminA, empresa: empresaA } = await crearEmpresaConAdmin();
    idsUsuarios.push(adminA.id);
    const { usuarioReclutador: reclutadorA, membresia: membresiaA } = await agregarReclutador(empresaA);
    idsUsuarios.push(reclutadorA.id);
    const { usuarioAdmin: adminB, passwordPlana: passB } = await crearEmpresaConAdmin();
    idsUsuarios.push(adminB.id);

    const tokenB = await loginYObtenerToken(adminB.email, passB);

    const res = await request(app)
      .patch(`/api/empresas/equipo/${membresiaA.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ activo: false });

    expect(res.status).toBe(404);
  });

  test('reclutador recibe 403 en las rutas de gestión de equipo', async () => {
    const { usuarioAdmin, empresa } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const { usuarioReclutador, membresia, passwordPlana } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);

    const token = await loginYObtenerToken(usuarioReclutador.email, passwordPlana);
    const auth = (req) => req.set('Authorization', `Bearer ${token}`);

    // Todas las rutas de gestión de equipo están restringidas a admin_empresa
    // (authorizeEmpresaRoles('admin_empresa')) — un reclutador recibe 403 en
    // TODAS, más allá de a quién apunten (recuperacion ya estaba cubierto;
    // acá se completan las 4 que faltaban).
    expect((await auth(request(app).get('/api/empresas/equipo/solicitudes'))).status).toBe(403);

    expect((await auth(request(app).post('/api/empresas/equipo/solicitar'))
      .send({ nombre: 'X', apellido: 'Y', email: 'nuevo-reclutador@test.local' })).status).toBe(403);

    expect((await auth(request(app).patch(`/api/empresas/equipo/${membresia.id}`))
      .send({ activo: false })).status).toBe(403);

    expect((await auth(request(app).delete(`/api/empresas/equipo/${membresia.id}`))).status).toBe(403);

    expect((await auth(request(app).post(`/api/empresas/equipo/${usuarioAdmin.id}/recuperacion`))).status).toBe(403);
  });
});
