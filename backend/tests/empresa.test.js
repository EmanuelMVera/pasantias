'use strict';
const request = require('supertest');
const app = require('../src/app');
const { crearEmpresaConAdmin, agregarReclutador, loginYObtenerToken } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

describe('EMPRESA', () => {
  const idsUsuarios = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  test('3. admin_empresa puede actualizar su empresa', async () => {
    const { usuarioAdmin, passwordPlana } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);

    const res = await request(app)
      .put('/api/empresas/mi-empresa')
      .set('Authorization', `Bearer ${token}`)
      .send({ descripcion: 'Descripción actualizada por el test' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.descripcion).toBe('Descripción actualizada por el test');
  });

  test('4. reclutador recibe 403 al intentar actualizar la empresa', async () => {
    const { usuarioAdmin, empresa } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const { usuarioReclutador, passwordPlana } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);
    const token = await loginYObtenerToken(usuarioReclutador.email, passwordPlana);

    const res = await request(app)
      .put('/api/empresas/mi-empresa')
      .set('Authorization', `Bearer ${token}`)
      .send({ descripcion: 'Un reclutador no debería poder guardar esto' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});
