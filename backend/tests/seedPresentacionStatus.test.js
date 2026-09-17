'use strict';

/**
 * seedPresentacionStatus.test.js — diagnóstico de solo lectura del escenario
 * demo (npm run db:seed:presentacion:status). Cubre: reporta "no cargado"
 * correctamente, reporta conteos exactos tras sembrar, y nunca imprime un
 * secreto (password/hash/token) en la salida del CLI real.
 */

const { execFileSync } = require('child_process');
const path = require('path');
const { Usuario } = require('../src/models');
const { obtenerConteos } = require('../src/utils/seedPresentacionStatus');
const { ejecutarSeedPresentacion, EMP_ADMIN, RECLUTA, ALUMNO } = require('../src/utils/seedPresentacion');
const { cerrarConexion } = require('./helpers/cleanup');

const BACKEND_DIR = path.join(__dirname, '..');

describe('seedPresentacionStatus — diagnóstico de solo lectura', () => {
  afterAll(async () => {
    await cerrarConexion();
  });

  test('conteos exactos tras sembrar: 3 logins, 10 candidatos, 1 empresa, 7 ofertas, 14 postulaciones', async () => {
    await ejecutarSeedPresentacion({ verbose: false });

    const r = await obtenerConteos();
    expect(r.cargado).toBe(true);
    expect(r.usuariosDemoLogin).toBe(3);
    expect(r.candidatosSinteticos).toBe(10);
    expect(r.empresas).toBe(1);
    expect(r.empresaUsuarios).toBe(2);
    expect(r.ofertas).toBe(7);
    expect(r.postulaciones).toBe(14);
    expect(r.solicitudesEmpresa).toBe(1);
    expect(r.solicitudesReclutadorTotal).toBe(2);
    expect(r.solicitudesReclutadorPendientes).toBe(1);
    expect(r.archivos).toBe(0);
  });

  test('CLI real: nunca imprime un password/hash, y reporta "no cargado" tras limpiar', async () => {
    // Limpia el escenario para ejercitar la rama "no cargado" — mismo helper
    // interno que usa ejecutarSeedPresentacion (llamado indirectamente: se
    // borran las 3 cuentas login, lo único que escenarioExiste() chequea).
    await Usuario.destroy({ where: { email: [EMP_ADMIN.email, RECLUTA.email, ALUMNO.email] }, force: true });

    const r1 = execFileSync('node', ['src/utils/seedPresentacionStatus.js'], {
      cwd: BACKEND_DIR, env: { ...process.env }, stdio: 'pipe',
    }).toString();
    expect(r1).toMatch(/NO está cargado/);
    expect(r1).not.toMatch(/\$2[aby]\$/); // nunca un hash bcrypt

    await ejecutarSeedPresentacion({ verbose: false });
    const r2 = execFileSync('node', ['src/utils/seedPresentacionStatus.js'], {
      cwd: BACKEND_DIR, env: { ...process.env }, stdio: 'pipe',
    }).toString();
    expect(r2).toMatch(/postulaciones:\s+14/);
    expect(r2).not.toContain('Demo1234!');
    expect(r2).not.toMatch(/\$2[aby]\$/);
  });
});
