'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const request = require('supertest');
const app = require('../src/app');
const { ActivityLog } = require('../src/models');
const { crearAlumno, crearAdmin, loginYObtenerToken } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

const BACKEND_DIR = path.join(__dirname, '..');

describe('ADMIN', () => {
  const idsUsuarios = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  test('no-admin recibe 403 en rutas de admin', async () => {
    const { usuario: alumno, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno.id);

    const token = await loginYObtenerToken(alumno.email, passwordPlana);

    const res = await request(app)
      .get('/api/admin/usuarios')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('sin token, las rutas de admin devuelven 401', async () => {
    const res = await request(app).get('/api/admin/dashboard-general');
    expect(res.status).toBe(401);
  });

  test('admin no puede autodesactivarse vía toggle', async () => {
    const { usuario: admin, passwordPlana } = await crearAdmin();
    idsUsuarios.push(admin.id);

    const token = await loginYObtenerToken(admin.email, passwordPlana);

    const res = await request(app)
      .patch(`/api/admin/usuarios/${admin.id}/toggle`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('exportarLogsCSV escapa celdas que empiezan con =/+/-/@ (CSV injection)', async () => {
    const { usuario: admin, passwordPlana } = await crearAdmin();
    idsUsuarios.push(admin.id);
    const { usuario: alumnoMalicioso } = await crearAlumno({
      usuario: { nombre: '=cmd|\' /C calc\'!A0', apellido: '+SUM(1+1)' },
    });
    idsUsuarios.push(alumnoMalicioso.id);
    await ActivityLog.create({
      usuarioId: alumnoMalicioso.id, accion: 'login', entidad: 'usuario', entidadId: alumnoMalicioso.id,
    });

    const token = await loginYObtenerToken(admin.email, passwordPlana);
    const res = await request(app)
      .get('/api/admin/logs/export')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // La celda "Usuario" queda como `nombre apellido` — ambos empiezan con
    // fórmula; escaparCeldaCsv debe prefijar con ' antes del = (y por la coma
    // entre nombre y apellido, la celda completa queda entre comillas).
    expect(res.text).not.toMatch(/,=cmd/);
    expect(res.text).toMatch(/'=cmd/);
  });

  describe('db:admin:status (subproceso real, solo lectura)', () => {
    const correr = (args, env = {}) => {
      try {
        const stdout = execFileSync('node', ['src/utils/adminStatus.js', ...args], {
          cwd: BACKEND_DIR,
          env: { ...process.env, ...env },
          stdio: 'pipe',
        });
        return { ok: true, stdout: String(stdout) };
      } catch (e) {
        return { ok: false, stdout: String(e.stdout || ''), stderr: String(e.stderr || '') };
      }
    };

    test('email inexistente → informa que no existe, no falla', () => {
      const r = correr(['--email=no-existe-zzz@test.local']);
      expect(r.ok).toBe(true);
      expect(r.stdout).toMatch(/No existe/i);
    });

    test('admin existente → muestra rol/activo/habilitado y NUNCA un hash bcrypt', async () => {
      const { usuario: admin } = await crearAdmin();
      idsUsuarios.push(admin.id);

      const r = correr([`--email=${admin.email}`]);
      expect(r.ok).toBe(true);
      expect(r.stdout).toMatch(/rol: admin/);
      expect(r.stdout).toMatch(/activo: true/);
      // Prefijo típico de un hash bcrypt ($2a$/$2b$/$2y$) — nunca debe aparecer.
      expect(r.stdout).not.toMatch(/\$2[aby]\$/);
    });

    test('sin --email y sin SEED_ADMIN_EMAIL → error de uso, no revienta', () => {
      const r = correr([], { SEED_ADMIN_EMAIL: '' });
      expect(r.ok).toBe(false);
      expect(r.stderr).toMatch(/Uso:/);
    });
  });
});
