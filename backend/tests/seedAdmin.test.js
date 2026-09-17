'use strict';

/**
 * seedAdmin.test.js — segundo administrador (iteración RBAC/identidad,
 * feedback de la profesora, sección 9 del pedido).
 *
 * Cubre ejecutarSeedAdmin() directamente (sin subprocess) para los casos de
 * negocio, y un subprocess real solo para la aserción "nunca loguea un
 * password" (necesita capturar stdout/stderr de un proceso real).
 */

const crypto = require('crypto');
const { execFileSync } = require('child_process');
const path = require('path');
const { ejecutarSeedAdmin } = require('../src/utils/seedAdmin');
const { Usuario } = require('../src/models');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

const BACKEND_DIR = path.join(__dirname, '..');

function sufijo() {
  return crypto.randomUUID().slice(0, 8);
}

describe('seedAdmin — segundo administrador', () => {
  const idsUsuarios = [];
  const envOriginal = {};
  const KEYS = [
    'NODE_ENV', 'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD',
    'SEED_SECOND_ADMIN_EMAIL', 'SEED_SECOND_ADMIN_PASSWORD',
    'SEED_SECOND_ADMIN_NAME', 'SEED_SECOND_ADMIN_LASTNAME',
  ];

  beforeEach(() => {
    for (const k of KEYS) envOriginal[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (envOriginal[k] === undefined) delete process.env[k];
      else process.env[k] = envOriginal[k];
    }
  });

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  test('crea dos admins nuevos (primario + segundo) en una sola corrida', async () => {
    const suf = sufijo();
    const emailPrimario = `admin-${suf}-1@test.local`;
    const emailSegundo = `admin-${suf}-2@test.local`;

    process.env.SEED_ADMIN_EMAIL = emailPrimario;
    process.env.SEED_ADMIN_PASSWORD = 'Primario123!';
    process.env.SEED_SECOND_ADMIN_EMAIL = emailSegundo;
    process.env.SEED_SECOND_ADMIN_PASSWORD = 'Segundo123!';
    process.env.SEED_SECOND_ADMIN_NAME = 'Compa';
    process.env.SEED_SECOND_ADMIN_LASTNAME = 'Equipo';

    const r = await ejecutarSeedAdmin();
    expect(r.creados.sort()).toEqual([emailPrimario, emailSegundo].sort());
    expect(r.existentes).toEqual([]);

    const u1 = await Usuario.findOne({ where: { email: emailPrimario } });
    const u2 = await Usuario.findOne({ where: { email: emailSegundo } });
    idsUsuarios.push(u1.id, u2.id);
    expect(u1.rol).toBe('admin');
    expect(u1.activo).toBe(true);
    expect(u1.habilitado).toBe(true);
    expect(u2.rol).toBe('admin');
    expect(u2.nombre).toBe('Compa');
    expect(u2.apellido).toBe('Equipo');
  });

  test('segunda ejecución no duplica ningún admin (idempotente)', async () => {
    const suf = sufijo();
    const emailPrimario = `admin-${suf}-1@test.local`;
    const emailSegundo = `admin-${suf}-2@test.local`;

    process.env.SEED_ADMIN_EMAIL = emailPrimario;
    process.env.SEED_ADMIN_PASSWORD = 'Primario123!';
    process.env.SEED_SECOND_ADMIN_EMAIL = emailSegundo;
    process.env.SEED_SECOND_ADMIN_PASSWORD = 'Segundo123!';

    const r1 = await ejecutarSeedAdmin();
    expect(r1.creados).toHaveLength(2);

    const r2 = await ejecutarSeedAdmin();
    expect(r2.creados).toEqual([]);
    expect(r2.existentes.sort()).toEqual([emailPrimario, emailSegundo].sort());

    const total = await Usuario.count({ where: { email: [emailPrimario, emailSegundo] } });
    expect(total).toBe(2);

    const u1 = await Usuario.findOne({ where: { email: emailPrimario } });
    const u2 = await Usuario.findOne({ where: { email: emailSegundo } });
    idsUsuarios.push(u1.id, u2.id);
  });

  test('usuario existente con rol distinto de admin aborta TODO sin crear nada', async () => {
    const suf = sufijo();
    const emailOcupado = `no-admin-${suf}@test.local`;
    const emailSegundo = `admin-${suf}-2@test.local`;

    const noAdmin = await Usuario.create({
      nombre: 'Alumno', apellido: 'Existente', email: emailOcupado,
      password: 'hash-irrelevante-para-el-test', rol: 'alumno',
      activo: true, habilitado: true,
    });
    idsUsuarios.push(noAdmin.id);

    process.env.SEED_ADMIN_EMAIL = emailOcupado;
    process.env.SEED_ADMIN_PASSWORD = 'Primario123!';
    process.env.SEED_SECOND_ADMIN_EMAIL = emailSegundo;
    process.env.SEED_SECOND_ADMIN_PASSWORD = 'Segundo123!';

    await expect(ejecutarSeedAdmin()).rejects.toThrow(/rol "alumno"/);

    // No eleva privilegios del existente...
    const sigueSiendoAlumno = await Usuario.findByPk(noAdmin.id);
    expect(sigueSiendoAlumno.rol).toBe('alumno');
    // ...ni crea el segundo admin (todo o nada).
    const segundo = await Usuario.findOne({ where: { email: emailSegundo } });
    expect(segundo).toBeNull();
  });

  test('SEED_SECOND_ADMIN_EMAIL sin password aborta sin crear nada', async () => {
    const suf = sufijo();
    const emailPrimario = `admin-${suf}-1@test.local`;
    const emailSegundo = `admin-${suf}-2@test.local`;

    process.env.SEED_ADMIN_EMAIL = emailPrimario;
    process.env.SEED_ADMIN_PASSWORD = 'Primario123!';
    process.env.SEED_SECOND_ADMIN_EMAIL = emailSegundo;
    delete process.env.SEED_SECOND_ADMIN_PASSWORD;

    await expect(ejecutarSeedAdmin()).rejects.toThrow(/SEED_SECOND_ADMIN_PASSWORD/);

    const primario = await Usuario.findOne({ where: { email: emailPrimario } });
    expect(primario).toBeNull();
  });

  test('password débil (< 6 caracteres) aborta sin crear nada', async () => {
    const suf = sufijo();
    const emailPrimario = `admin-${suf}-1@test.local`;

    process.env.SEED_ADMIN_EMAIL = emailPrimario;
    process.env.SEED_ADMIN_PASSWORD = '123';

    await expect(ejecutarSeedAdmin()).rejects.toThrow(/inválida/);

    const primario = await Usuario.findOne({ where: { email: emailPrimario } });
    expect(primario).toBeNull();
  });

  test('mismo email en primario y segundo aborta sin crear nada', async () => {
    const suf = sufijo();
    const email = `admin-${suf}@test.local`;

    process.env.SEED_ADMIN_EMAIL = email;
    process.env.SEED_ADMIN_PASSWORD = 'Primario123!';
    process.env.SEED_SECOND_ADMIN_EMAIL = email;
    process.env.SEED_SECOND_ADMIN_PASSWORD = 'Segundo123!';

    await expect(ejecutarSeedAdmin()).rejects.toThrow(/mismo email/);

    const usuario = await Usuario.findOne({ where: { email } });
    expect(usuario).toBeNull();
  });

  test('CLI real: ningún password en texto plano aparece en stdout/stderr', async () => {
    const suf = sufijo();
    const emailPrimario = `admin-${suf}-1@test.local`;
    const emailSegundo = `admin-${suf}-2@test.local`;
    const passPrimario = 'Primario123!';
    const passSegundo = 'Segundo123!';

    let stdout = '';
    let stderr = '';
    try {
      stdout = String(execFileSync('node', ['src/utils/seedAdmin.js'], {
        cwd: BACKEND_DIR,
        env: {
          ...process.env,
          SEED_ADMIN_EMAIL: emailPrimario,
          SEED_ADMIN_PASSWORD: passPrimario,
          SEED_SECOND_ADMIN_EMAIL: emailSegundo,
          SEED_SECOND_ADMIN_PASSWORD: passSegundo,
        },
        stdio: 'pipe',
      }));
    } catch (e) {
      stdout = String(e.stdout || '');
      stderr = String(e.stderr || '');
    }

    const salida = stdout + stderr;
    expect(salida).not.toContain(passPrimario);
    expect(salida).not.toContain(passSegundo);
    expect(salida).toMatch(/creado/i);

    const creados = await Usuario.findAll({ where: { email: [emailPrimario, emailSegundo] } });
    idsUsuarios.push(...creados.map((u) => u.id));
  });
});
