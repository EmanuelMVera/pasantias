'use strict';
const request = require('supertest');
const app = require('../src/app');
const { ActivityLog } = require('../src/models');
const { crearAdmin, loginYObtenerToken } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

// Filtros de fecha de GET /api/admin/logs (y de la exportación, que comparte _whereLogs).
describe('ADMIN LOGS — filtro por rango de fechas', () => {
  const idsUsuarios = [];
  let token;
  let usuarioId;

  // Tres logs del mismo usuario (acota la consulta aunque la base tenga miles de logs):
  // uno a la mañana del 2020-03-15, uno al final de ese día, y uno al día siguiente.
  const MANANA   = new Date('2020-03-15T08:00:00.000Z');
  const NOCHE    = new Date('2020-03-15T23:30:00.000Z');
  const SIGUIENTE = new Date('2020-03-16T00:30:00.000Z');

  beforeAll(async () => {
    const { usuario, passwordPlana } = await crearAdmin();
    idsUsuarios.push(usuario.id);
    usuarioId = usuario.id;
    token = await loginYObtenerToken(usuario.email, passwordPlana);

    for (const createdAt of [MANANA, NOCHE, SIGUIENTE]) {
      await ActivityLog.create({ usuarioId, accion: 'sistema', entidad: 'test_rango', createdAt });
    }
  });

  afterAll(async () => {
    await ActivityLog.destroy({ where: { entidad: 'test_rango' } });
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  const listar = (query) =>
    request(app).get('/api/admin/logs').query({ usuarioId, entidad: 'test_rango', ...query })
      .set('Authorization', `Bearer ${token}`);

  const horas = (res) => res.body.data.map((l) => new Date(l.createdAt).toISOString()).sort();

  test('`hasta` con solo la fecha incluye el día completo (antes lo excluía)', async () => {
    const res = await listar({ desde: '2020-03-15', hasta: '2020-03-15' });
    expect(res.status).toBe(200);
    expect(horas(res)).toEqual([MANANA.toISOString(), NOCHE.toISOString()]);
    expect(res.body.pagination.total).toBe(2);
  });

  test('`hasta` = un día antes deja afuera los logs del día siguiente', async () => {
    const res = await listar({ hasta: '2020-03-15' });
    expect(horas(res)).toEqual([MANANA.toISOString(), NOCHE.toISOString()]);
  });

  test('`hasta` con hora explícita se respeta tal cual', async () => {
    const res = await listar({ desde: '2020-03-15', hasta: '2020-03-15T12:00:00.000Z' });
    expect(horas(res)).toEqual([MANANA.toISOString()]);
  });

  test('`desde` sigue siendo inclusivo desde las 00:00', async () => {
    const res = await listar({ desde: '2020-03-16' });
    expect(horas(res)).toEqual([SIGUIENTE.toISOString()]);
  });

  test('la exportación CSV aplica el mismo rango (día completo)', async () => {
    const res = await request(app)
      .get('/api/admin/logs/export')
      .query({ usuarioId, entidad: 'test_rango', desde: '2020-03-15', hasta: '2020-03-15' })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const filas = res.text.trim().split('\n').slice(1); // sin header
    expect(filas).toHaveLength(2);
  });
});
