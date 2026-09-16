'use strict';

/**
 * csvImport.test.js — importación masiva de alumnos/egresados por CSV.
 *
 * Cubre: dry-run (no escribe nada), duplicados internos y contra la base
 * (incluido un usuario soft-deleted), validaciones de fila, límite de filas,
 * archivo no-CSV, autorización (401/403), confirmación real (transacción,
 * password inutilizable, token de activación), rollback ante fallo a mitad
 * de la confirmación, y que ningún usuario quede sin Perfil.
 */

const request = require('supertest');
const app = require('../src/app');
const { config } = require('../src/config/env');
const { Usuario, Perfil, ActivityLog } = require('../src/models');
const { crearAdmin, crearAlumno, loginYObtenerToken } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

const HEADER = 'legajo,nombre,apellido,email,rol,carrera,anioEgreso,telefono,ubicacion';

function filaAlumno({ legajo, email, nombre = 'Test', apellido = 'Importado' }) {
  return `${legajo},${nombre},${apellido},${email},alumno,,,,`;
}

describe('IMPORTACIÓN CSV — alumnos/egresados', () => {
  const idsUsuarios = [];
  let admin;
  let tokenAdmin;

  beforeAll(async () => {
    const r = await crearAdmin();
    admin = r.usuario;
    idsUsuarios.push(admin.id);
    tokenAdmin = await loginYObtenerToken(admin.email, r.passwordPlana);
  });

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  const postCsv = (csvTexto, { dryRun = true, token = tokenAdmin, filename = 'import.csv' } = {}) => {
    let req = request(app).post('/api/admin/importaciones/alumnos');
    if (dryRun) req = req.query({ dryRun: 'true' });
    if (token) req = req.set('Authorization', `Bearer ${token}`);
    return req.attach('archivo', Buffer.from(csvTexto, 'utf8'), { filename, contentType: 'text/csv' });
  };

  // ── Autorización ─────────────────────────────────────────────────────────
  test('sin token → 401', async () => {
    const res = await postCsv([HEADER, filaAlumno({ legajo: 'X-1', email: `x1-${Date.now()}@test.local` })].join('\n'), { token: null });
    expect(res.status).toBe(401);
  });

  test('rol no-admin → 403', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);
    const token = await loginYObtenerToken(usuario.email, passwordPlana);
    const res = await postCsv([HEADER, filaAlumno({ legajo: 'X-2', email: `x2-${Date.now()}@test.local` })].join('\n'), { token });
    expect(res.status).toBe(403);
  });

  // ── Plantilla ────────────────────────────────────────────────────────────
  test('GET plantilla → 200, CSV con el header exacto de 9 columnas', async () => {
    const res = await request(app)
      .get('/api/admin/importaciones/alumnos/plantilla')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text.replace(/^﻿/, '')).toMatch(new RegExp(`^${HEADER}`));
  });

  // ── Dry-run ──────────────────────────────────────────────────────────────
  test('dry-run con CSV válido (2 alumno, 1 egresado) → 3 válidas, 0 filas creadas', async () => {
    const suf = Date.now();
    const csv = [
      HEADER,
      filaAlumno({ legajo: `DR-A-${suf}`, email: `dr-a-${suf}@test.local` }),
      filaAlumno({ legajo: `DR-B-${suf}`, email: `dr-b-${suf}@test.local` }),
      `DR-C-${suf},Egresada,Test,dr-c-${suf}@test.local,egresado,Sistemas,2022,,`,
    ].join('\n');

    const antes = await Usuario.count();
    const res = await postCsv(csv);

    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.totalFilas).toBe(3);
    expect(res.body.validas).toBe(3);
    expect(res.body.invalidas).toBe(0);
    expect(await Usuario.count()).toBe(antes); // dry-run: nada se escribe
  });

  test('email ya existente (incluido un usuario soft-deleted) → conflicto', async () => {
    const { usuario: existente } = await crearAlumno();
    idsUsuarios.push(existente.id);
    await existente.destroy(); // soft delete — el índice único sigue bloqueando el email

    const csv = [HEADER, filaAlumno({ legajo: `CONF-${Date.now()}`, email: existente.email })].join('\n');
    const res = await postCsv(csv);

    expect(res.status).toBe(200);
    expect(res.body.validas).toBe(0);
    expect(res.body.invalidas).toBe(1);
    expect(res.body.filas[0].errores.join(' ')).toMatch(/ya existe.*email/i);
  });

  test('legajo duplicado dentro del mismo archivo → ambas filas inválidas', async () => {
    const suf = Date.now();
    const legajo = `DUP-${suf}`;
    const csv = [
      HEADER,
      filaAlumno({ legajo, email: `dupa-${suf}@test.local` }),
      filaAlumno({ legajo, email: `dupb-${suf}@test.local` }),
    ].join('\n');

    const res = await postCsv(csv);
    expect(res.body.validas).toBe(0);
    expect(res.body.invalidas).toBe(2);
    expect(res.body.filas.every((f) => f.errores.join(' ').match(/legajo duplicado/i))).toBe(true);
  });

  test('rol inválido → error específico', async () => {
    const suf = Date.now();
    const csv = [HEADER, `ROL-${suf},Test,Test,rol-${suf}@test.local,profesor,,,,`].join('\n');
    const res = await postCsv(csv);
    expect(res.body.invalidas).toBe(1);
    expect(res.body.filas[0].errores.join(' ')).toMatch(/rol debe ser/i);
  });

  test('anioEgreso presente para alumno → inválida; ausente para egresado → inválida', async () => {
    const suf = Date.now();
    const csv = [
      HEADER,
      `AA-${suf},Test,Test,aa-${suf}@test.local,alumno,,2020,,`, // alumno con anioEgreso
      `AE-${suf},Test,Test,ae-${suf}@test.local,egresado,,,,`,    // egresado sin anioEgreso
    ].join('\n');
    const res = await postCsv(csv);
    expect(res.body.validas).toBe(0);
    expect(res.body.invalidas).toBe(2);
  });

  test('más filas que el límite configurado → 400', async () => {
    const filas = Array.from({ length: config.csvImport.maxRows + 1 }, (_, i) =>
      filaAlumno({ legajo: `LIM-${i}`, email: `lim-${i}-${Date.now()}@test.local` }));
    const csv = [HEADER, ...filas].join('\n');

    const res = await postCsv(csv);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/máximo permitido/i);
  }, 30000);

  test('archivo no-CSV (PNG) → 400', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(32)]);
    const res = await request(app)
      .post('/api/admin/importaciones/alumnos')
      .query({ dryRun: 'true' })
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .attach('archivo', png, { filename: 'no-es-csv.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });

  // ── Confirmación real ────────────────────────────────────────────────────
  test('confirmación: crea Usuario+Perfil, password inutilizable, tokenReset hasheado, auditoría, sin usuarios sin Perfil', async () => {
    const suf = Date.now();
    const email = `confirma-${suf}@test.local`;
    const legajo = `CF-${suf}`; // legajo.regex por defecto: máx 20 chars
    const csv = [HEADER, filaAlumno({ legajo, email })].join('\n');

    const logsAntes = await ActivityLog.count({ where: { accion: 'importar_alumnos_csv' } });
    const res = await postCsv(csv, { dryRun: false });

    expect(res.status).toBe(201);
    expect(res.body.dryRun).toBe(false);
    expect(res.body.totalCreados).toBe(1);
    const creadoId = res.body.creados[0].id;
    idsUsuarios.push(creadoId);

    const usuario = await Usuario.findByPk(creadoId);
    // tokenReset se persiste como hash SHA-256 (64 hex), nunca el token en claro.
    expect(usuario.tokenReset).toMatch(/^[0-9a-f]{64}$/);
    // El password guardado es un hash bcrypt, nunca utilizable con una password trivial.
    expect(usuario.password).toMatch(/^\$2[aby]\$/);

    const perfil = await Perfil.findOne({ where: { usuarioId: creadoId } });
    expect(perfil).not.toBeNull();
    expect(perfil.legajo).toBe(legajo.toUpperCase());

    expect(await ActivityLog.count({ where: { accion: 'importar_alumnos_csv' } })).toBe(logsAntes + 1);

    // Fuera de producción y sin SMTP configurado en la suite → devTokens presente.
    expect(res.body.devTokens?.[0]?.email).toBe(email);
    expect(typeof res.body.devTokens?.[0]?.devToken).toBe('string');
  });

  test('rollback: si una fila falla a mitad de la confirmación, ningún usuario de ese lote queda creado', async () => {
    const suf = Date.now();
    const emailA = `rollback-a-${suf}@test.local`;
    const emailB = `rollback-b-${suf}@test.local`;
    const csv = [
      HEADER,
      filaAlumno({ legajo: `RB-A-${suf}`, email: emailA }),
      filaAlumno({ legajo: `RB-B-${suf}`, email: emailB }),
    ].join('\n');

    const original = Perfil.create.bind(Perfil);
    let llamadas = 0;
    const spy = jest.spyOn(Perfil, 'create').mockImplementation(async (...args) => {
      llamadas += 1;
      if (llamadas === 2) throw new Error('Fallo simulado a mitad de la importación');
      return original(...args);
    });

    try {
      const res = await postCsv(csv, { dryRun: false });
      expect(res.status).toBe(500);
    } finally {
      spy.mockRestore();
    }

    // Ni la fila A (que "alcanzó a" crear su Usuario antes del fallo en B)
    // debe haber quedado persistida — todo o nada.
    expect(await Usuario.findOne({ where: { email: emailA }, paranoid: false })).toBeNull();
    expect(await Usuario.findOne({ where: { email: emailB }, paranoid: false })).toBeNull();
  });
});
