'use strict';

/**
 * demoStatus.test.js — GET /api/demo/status (público, refleja la base real).
 *
 * Antes de correr, borra las 3 cuentas demo si ya existían (de una corrida
 * previa de seedPresentacion.test.js u otra) para que el caso "deshabilitado"
 * sea determinista — la base de test se reutiliza entre corridas (ver
 * tests/setup/globalTeardown.js), no se asume que arranca vacía.
 */

const request = require('supertest');
const app = require('../src/app');
const { Usuario, sequelize } = require('../src/models');
const {
  escenarioExiste,
  ejecutarSeedPresentacion,
  EMP_ADMIN,
  RECLUTA,
  ALUMNO,
} = require('../src/utils/seedPresentacion');

describe('GET /api/demo/status', () => {
  beforeAll(async () => {
    await Usuario.destroy({
      where: { email: [EMP_ADMIN.email, RECLUTA.email, ALUMNO.email] },
      force: true,
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('sin escenario cargado → enabled:false, accounts:[]', async () => {
    expect(await escenarioExiste()).toBe(false);

    const res = await request(app).get('/api/demo/status');

    expect(res.status).toBe(200); // público: sin cookie ni Authorization
    expect(res.body).toEqual({ success: true, enabled: false, accounts: [] });
  });

  test('tras sembrar el escenario → enabled:true, exactamente 3 cuentas, ninguna admin', async () => {
    await ejecutarSeedPresentacion({ verbose: false });

    const res = await request(app).get('/api/demo/status');

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.accounts).toHaveLength(3);

    const emails = res.body.accounts.map((c) => c.email);
    expect(emails).toEqual(expect.arrayContaining([EMP_ADMIN.email, RECLUTA.email, ALUMNO.email]));
    expect(emails).not.toContain('sistema@demo.com');
    expect(res.body.accounts.some((c) => /admin del sistema/i.test(c.rol))).toBe(false);
  });
});
