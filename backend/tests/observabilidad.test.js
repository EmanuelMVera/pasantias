'use strict';

/**
 * observabilidad.test.js — OPS-01.
 *
 * Request id, redacción del log de auditoría, requestId en activity_logs,
 * y el script de archivo/retención.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const request = require('supertest');
const app = require('../src/app');
const { ActivityLog, sequelize } = require('../src/models');
const { registrarAuditoria, redactar } = require('../src/utils/auditLog');
const { archivar, ARCHIVE_DIR } = require('../src/utils/archivarActivityLogs');
const { crearAlumno, loginYObtenerToken } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('OPS-01 — Observabilidad', () => {
  const idsUsuarios = [];
  const archivosCreados = [];
  const idsAuditoria = [];

  afterAll(async () => {
    if (idsAuditoria.length) await ActivityLog.destroy({ where: { id: idsAuditoria } });
    for (const p of archivosCreados) { try { fs.rmSync(p, { force: true }); } catch { /* nada */ } }
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  // ── Redacción del log de auditoría ──────────────────────────────────────────
  test('redactar() censura claves sensibles a cualquier profundidad', () => {
    const out = redactar({ password: 'p', ok: 'z', anidado: { token: 't', nombre: 'Ana' }, lista: [{ secret: 's' }] });
    expect(out.password).toBe('[REDACTED]');
    expect(out.ok).toBe('z');
    expect(out.anidado.token).toBe('[REDACTED]');
    expect(out.anidado.nombre).toBe('Ana');
    expect(out.lista[0].secret).toBe('[REDACTED]');
  });

  test('registrarAuditoria persiste el detalle redactado y deriva req.usuario/ip/id', async () => {
    const { usuario } = await crearAlumno();
    idsUsuarios.push(usuario.id);

    const fakeReq = { usuario: { id: usuario.id }, ip: '203.0.113.9', id: 'req-obs-test-0001' };
    await registrarAuditoria({
      req: fakeReq,
      accion: 'sistema',
      entidad: 'test',
      entidadId: 1,
      detalle: { password: 'secreto', accionRealizada: 'x' },
    });

    const fila = await ActivityLog.findOne({ where: { requestId: 'req-obs-test-0001' } });
    expect(fila).toBeTruthy();
    idsAuditoria.push(fila.id);
    expect(fila.usuarioId).toBe(usuario.id);
    expect(fila.ip).toBe('203.0.113.9');
    expect(fila.detalle.password).toBe('[REDACTED]');
    expect(fila.detalle.accionRealizada).toBe('x');
  });

  // ── Request id ──────────────────────────────────────────────────────────────
  test('toda respuesta trae X-Request-Id; un id entrante válido se propaga', async () => {
    const r1 = await request(app).get('/api/health');
    expect(r1.headers['x-request-id']).toMatch(/^[\w-]{8,64}$/);

    const r2 = await request(app).get('/api/health').set('X-Request-Id', 'traza-abcdef123456');
    expect(r2.headers['x-request-id']).toBe('traza-abcdef123456');
  });

  test('un 500 responde con requestId y sin stack/mensaje interno', async () => {
    // id no numérico → Postgres "invalid input syntax for integer" → error no manejado
    const res = await request(app).get('/api/ofertas/no-es-un-numero');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      message: 'Error interno del servidor.',
      requestId: res.headers['x-request-id'],
    });
  });

  // ── requestId en el log de auditoría ────────────────────────────────────────
  test('el login registra una entrada de auditoría con requestId', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);
    await loginYObtenerToken(usuario.email, passwordPlana);

    // registrarAuditoria es fire-and-forget → esperar a que persista
    let fila = null;
    for (let i = 0; i < 20 && !fila; i++) {
      fila = await ActivityLog.findOne({ where: { usuarioId: usuario.id, accion: 'login' } });
      if (!fila) await sleep(50);
    }
    expect(fila).toBeTruthy();
    idsAuditoria.push(fila.id);
    expect(fila.requestId).toMatch(/^[\w-]{8,64}$/);
    expect(fila.detalle.email).toBe(usuario.email);
  });

  // ── Índices de la migración 011 ────────────────────────────────────────────
  test('existen los índices idx_activity_logs_accion_created e idx_activity_logs_request', async () => {
    const [rows] = await sequelize.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'activity_logs'
       AND indexname IN ('idx_activity_logs_accion_created', 'idx_activity_logs_request')`,
    );
    expect(rows.map((r) => r.indexname).sort()).toEqual(
      ['idx_activity_logs_accion_created', 'idx_activity_logs_request'],
    );
  });

  // ── Retención / archivo ────────────────────────────────────────────────────
  test('archivar({ apply:true }) exporta a .jsonl.gz y borra sólo lo archivado', async () => {
    const hace11Anios = new Date(Date.now() - 11 * 365 * 24 * 60 * 60 * 1000);
    const creadas = await ActivityLog.bulkCreate(
      [1, 2, 3].map((n) => ({ accion: 'sistema', entidad: 'obs-archivo', entidadId: n, createdAt: hace11Anios })),
      { returning: true },
    );
    const ids = creadas.map((f) => f.id);

    // dry-run: no borra
    const dry = await archivar({ apply: false, retentionDays: 3650 });
    expect(dry.borradas).toBe(0);
    expect(await ActivityLog.count({ where: { id: ids } })).toBe(3);

    const res = await archivar({ apply: true, retentionDays: 3650 });
    if (res.archivo) archivosCreados.push(res.archivo);

    expect(res.archivadas).toBeGreaterThanOrEqual(3);
    expect(res.borradas).toBe(res.archivadas);
    expect(await ActivityLog.count({ where: { id: ids } })).toBe(0);
    expect(fs.existsSync(res.archivo)).toBe(true);
    expect(res.archivo.startsWith(ARCHIVE_DIR)).toBe(true);

    // el .gz tiene una línea NDJSON por fila archivada
    const lineas = zlib.gunzipSync(fs.readFileSync(res.archivo)).toString('utf8').trim().split('\n');
    expect(lineas.length).toBe(res.archivadas);
    expect(JSON.parse(lineas[0])).toHaveProperty('accion');
  });
});
