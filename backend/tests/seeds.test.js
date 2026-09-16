'use strict';

/**
 * seeds.test.js — DEPLOY-01.
 *
 * Guards de los seeds contra ejecución accidental en producción.
 */

const { execFileSync } = require('child_process');
const path = require('path');

const BACKEND_DIR = path.join(__dirname, '..');

describe('seedGuards.bloquearSiProd', () => {
  let exitSpy;
  let errSpy;

  beforeEach(() => {
    jest.resetModules();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('EXIT'); });
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errSpy.mockRestore();
    jest.dontMock('../src/config/env');
  });

  const cargar = (isProd) => {
    jest.doMock('../src/config/env', () => ({ config: { isProd } }));
    return require('../src/utils/seedGuards');
  };

  test('fuera de producción no hace nada', () => {
    const { bloquearSiProd } = cargar(false);
    expect(() => bloquearSiProd('db:seed:demo')).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test('en producción sin override → aborta con exit(1)', () => {
    const { bloquearSiProd } = cargar(true);
    expect(() => bloquearSiProd('db:seed:demo')).toThrow('EXIT');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test('en producción con overrideEnv=true → permite', () => {
    const { bloquearSiProd } = cargar(true);
    process.env.__ALLOW_TEST = 'true';
    try {
      expect(() => bloquearSiProd('x', { overrideEnv: '__ALLOW_TEST' })).not.toThrow();
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      delete process.env.__ALLOW_TEST;
    }
  });

  test('en producción con overrideEnv ausente → aborta', () => {
    const { bloquearSiProd } = cargar(true);
    expect(() => bloquearSiProd('x', { overrideEnv: '__ALLOW_TEST' })).toThrow('EXIT');
  });
});

describe('seeds — abortan en producción (subproceso real)', () => {
  const correr = (script, env) => {
    try {
      execFileSync('node', [script], {
        cwd: BACKEND_DIR,
        env: { ...process.env, ...env },
        stdio: 'pipe',
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, stderr: String(e.stderr || ''), stdout: String(e.stdout || '') };
    }
  };

  test('db:seed:demo → bloqueado en producción sin excepción', () => {
    const r = correr('src/utils/seedDemo.js', { NODE_ENV: 'production' });
    expect(r.ok).toBe(false);
    expect(r.stderr + r.stdout).toMatch(/producción|production/i);
  });

  test('db:seed:presentacion → exige ALLOW_PRODUCTION_DEMO_SEED en producción', () => {
    const r = correr('src/utils/seedPresentacion.js', { NODE_ENV: 'production', ALLOW_PRODUCTION_DEMO_SEED: '' });
    expect(r.ok).toBe(false);
    expect(r.stderr + r.stdout).toMatch(/ALLOW_PRODUCTION_DEMO_SEED/);
  });

  test('db:seed:admin → exige SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD en producción', () => {
    const r = correr('src/utils/seedAdmin.js', {
      NODE_ENV: 'production', SEED_ADMIN_EMAIL: '', SEED_ADMIN_PASSWORD: '',
    });
    expect(r.ok).toBe(false);
    expect(r.stderr + r.stdout).toMatch(/SEED_ADMIN_EMAIL|SEED_ADMIN_PASSWORD/);
  });

  test('scripts/seed-e2e.js → rechaza un DB_HOST remoto (nunca toca Neon u otro host no local)', () => {
    const r = correr('scripts/seed-e2e.js', { DB_HOST: 'remote-host.example.com' });
    expect(r.ok).toBe(false);
    expect(r.stderr + r.stdout).toMatch(/allowlist local/);
  });
});
