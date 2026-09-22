'use strict';
const request = require('supertest');
const app = require('../src/app');
const { Oferta } = require('../src/models');
const {
  crearAdmin,
  crearEmpresaConAdmin,
  crearOferta,
  loginYObtenerToken,
} = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

describe('ADMIN MODERACION DE OFERTAS (RBAC-04)', () => {
  const idsUsuarios = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  async function tokenAdmin() {
    const { usuario, passwordPlana } = await crearAdmin();
    idsUsuarios.push(usuario.id);
    return loginYObtenerToken(usuario.email, passwordPlana);
  }

  test('GET /admin/ofertas/pendientes solo devuelve ofertas con estadoModeracion=pendiente', async () => {
    const { empresa } = await crearEmpresaConAdmin();
    const pendiente = await crearOferta(empresa, { estadoModeracion: 'pendiente' });
    const aprobada  = await crearOferta(empresa, { estadoModeracion: 'aprobada' });

    const token = await tokenAdmin();
    const res = await request(app)
      .get('/api/admin/ofertas/pendientes')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((o) => o.id);
    expect(ids).toContain(pendiente.id);
    expect(ids).not.toContain(aprobada.id);
  });

  test('aprobar: pendiente → aprobada, no toca estado', async () => {
    const { empresa } = await crearEmpresaConAdmin();
    const oferta = await crearOferta(empresa, { estado: 'activa', estadoModeracion: 'pendiente' });

    const token = await tokenAdmin();
    const res = await request(app)
      .patch(`/api/admin/ofertas/${oferta.id}/moderar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ accion: 'aprobar' });

    expect(res.status).toBe(200);
    expect(res.body.data.estadoModeracion).toBe('aprobada');

    const listado = await request(app).get('/api/ofertas');
    expect(listado.body.data.map((o) => o.id)).toContain(oferta.id);
  });

  test('rechazar: pendiente → rechazada, sin tocar estado (no se mezcla con el ciclo de vida)', async () => {
    const { empresa } = await crearEmpresaConAdmin();
    const oferta = await crearOferta(empresa, { estado: 'activa', estadoModeracion: 'pendiente' });

    const token = await tokenAdmin();
    const res = await request(app)
      .patch(`/api/admin/ofertas/${oferta.id}/moderar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ accion: 'rechazar' });

    expect(res.status).toBe(200);
    expect(res.body.data.estadoModeracion).toBe('rechazada');

    const fresca = await Oferta.findByPk(oferta.id, { attributes: ['estado'] });
    expect(fresca.estado).toBe('activa'); // ciclo de vida intacto
  });

  test('rechazada es terminal: no se puede volver a aprobar', async () => {
    const { empresa } = await crearEmpresaConAdmin();
    const oferta = await crearOferta(empresa, { estadoModeracion: 'rechazada' });

    const token = await tokenAdmin();
    const res = await request(app)
      .patch(`/api/admin/ofertas/${oferta.id}/moderar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ accion: 'aprobar' });

    expect(res.status).toBe(400);
  });

  test('auto_aprobada → rechazada es una transición válida', async () => {
    const { empresa } = await crearEmpresaConAdmin();
    const oferta = await crearOferta(empresa, { estadoModeracion: 'auto_aprobada' });

    const token = await tokenAdmin();
    const res = await request(app)
      .patch(`/api/admin/ofertas/${oferta.id}/moderar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ accion: 'rechazar' });

    expect(res.status).toBe(200);
    expect(res.body.data.estadoModeracion).toBe('rechazada');
  });

  test('pausar/cerrar tocan estado, nunca estadoModeracion', async () => {
    const { empresa } = await crearEmpresaConAdmin();
    const oferta = await crearOferta(empresa, { estado: 'activa', estadoModeracion: 'aprobada' });

    const token = await tokenAdmin();
    const pausar = await request(app)
      .patch(`/api/admin/ofertas/${oferta.id}/moderar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ accion: 'pausar' });

    expect(pausar.status).toBe(200);
    expect(pausar.body.data.estado).toBe('pausada');

    const cerrar = await request(app)
      .patch(`/api/admin/ofertas/${oferta.id}/moderar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ accion: 'cerrar' });
    expect(cerrar.status).toBe(200);
    expect(cerrar.body.data.estado).toBe('cerrada');

    const fresca = await Oferta.findByPk(oferta.id, { attributes: ['estadoModeracion'] });
    expect(fresca.estadoModeracion).toBe('aprobada'); // moderación intacta durante todo el flujo
  });

  test('accion inválida devuelve 400', async () => {
    const { empresa } = await crearEmpresaConAdmin();
    const oferta = await crearOferta(empresa);

    const token = await tokenAdmin();
    const res = await request(app)
      .patch(`/api/admin/ofertas/${oferta.id}/moderar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ accion: 'invalida' });

    expect(res.status).toBe(400);
  });

  test('fallback legacy { aprobada: true } sigue funcionando como accion=aprobar', async () => {
    const { empresa } = await crearEmpresaConAdmin();
    const oferta = await crearOferta(empresa, { estadoModeracion: 'pendiente' });

    const token = await tokenAdmin();
    const res = await request(app)
      .patch(`/api/admin/ofertas/${oferta.id}/moderar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ aprobada: true });

    expect(res.status).toBe(200);
    expect(res.body.data.estadoModeracion).toBe('aprobada');
  });
});
