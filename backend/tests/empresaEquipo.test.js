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
    const { usuarioReclutador, passwordPlana } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);

    const token = await loginYObtenerToken(usuarioReclutador.email, passwordPlana);

    const res = await request(app)
      .post(`/api/empresas/equipo/${usuarioAdmin.id}/recuperacion`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
