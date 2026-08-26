'use strict';
const request = require('supertest');
const app = require('../src/app');
const { crearEmpresaConAdmin, crearOferta } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');
const { loginYObtenerToken } = require('./helpers/factories');

describe('OFERTA', () => {
  const idsUsuarios = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  test('empresa B no puede editar una oferta de empresa A', async () => {
    const { usuarioAdmin: adminA, empresa: empresaA } = await crearEmpresaConAdmin();
    idsUsuarios.push(adminA.id);
    const ofertaA = await crearOferta(empresaA);
    const { usuarioAdmin: adminB, passwordPlana: passB } = await crearEmpresaConAdmin();
    idsUsuarios.push(adminB.id);

    const tokenB = await loginYObtenerToken(adminB.email, passB);

    const res = await request(app)
      .put(`/api/ofertas/${ofertaA.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ titulo: 'Intento de edición ajena' });

    expect(res.status).toBe(404);
  });

  test('empresa B no puede cerrar una oferta de empresa A', async () => {
    const { usuarioAdmin: adminA, empresa: empresaA } = await crearEmpresaConAdmin();
    idsUsuarios.push(adminA.id);
    const ofertaA = await crearOferta(empresaA);
    const { usuarioAdmin: adminB, passwordPlana: passB } = await crearEmpresaConAdmin();
    idsUsuarios.push(adminB.id);

    const tokenB = await loginYObtenerToken(adminB.email, passB);

    const res = await request(app)
      .delete(`/api/ofertas/${ofertaA.id}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });

  test('el listado público no incluye ofertas sin moderar', async () => {
    const { usuarioAdmin, empresa } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const ofertaSinModerar = await crearOferta(empresa, { moderada: false });

    const res = await request(app).get('/api/ofertas');

    expect(res.status).toBe(200);
    const ids = res.body.data.map((o) => o.id);
    expect(ids).not.toContain(ofertaSinModerar.id);
  });

  test('el detalle público de una oferta sin moderar devuelve 404 sin sesión', async () => {
    const { usuarioAdmin, empresa } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const ofertaSinModerar = await crearOferta(empresa, { moderada: false });

    const res = await request(app).get(`/api/ofertas/${ofertaSinModerar.id}`);

    expect(res.status).toBe(404);
  });

  test('el detalle público de una oferta moderada no expone el CUIT de la empresa', async () => {
    const { usuarioAdmin, empresa } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const oferta = await crearOferta(empresa);

    const res = await request(app).get(`/api/ofertas/${oferta.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.empresa.cuit).toBeUndefined();
    expect(res.body.data.empresa.razonSocial).toBe(empresa.razonSocial);
  });
});
