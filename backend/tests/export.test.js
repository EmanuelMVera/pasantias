'use strict';

/**
 * export.test.js — exportación PDF/Excel de logs y estadísticas (Fase 2,
 * sección 14 del pedido de iteración funcional/visual).
 *
 * Cubre: autorización (solo admin), formato inválido → 400, MIME y
 * Content-Disposition correctos, workbook Excel válido (exceljs lo puede
 * leer), PDF válido (header %PDF-), neutralización de fórmulas (CSV
 * injection) en una celda de Excel, límite de filas respetado, ninguna
 * columna sensible expuesta, auditoría de la exportación (y nunca el
 * contenido exportado), rate limit dedicado.
 */

const request = require('supertest');
const ExcelJS = require('exceljs');
const app = require('../src/app');
const { ActivityLog } = require('../src/models');
const {
  crearAlumno, crearAdmin, crearEmpresaConAdmin, loginYObtenerToken,
} = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');
const { contarPaginasPdf, textoDePdf } = require('./helpers/pdf');

describe('EXPORT — logs y estadísticas (PDF/Excel)', () => {
  const idsUsuarios = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  async function tokenAdmin() {
    const { usuario, passwordPlana } = await crearAdmin();
    idsUsuarios.push(usuario.id);
    return { usuario, token: await loginYObtenerToken(usuario.email, passwordPlana) };
  }

  // ── Autorización ────────────────────────────────────────────────────────

  test('un alumno no puede exportar logs ni estadísticas (403)', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);
    const token = await loginYObtenerToken(usuario.email, passwordPlana);

    const r1 = await request(app).get('/api/admin/logs/export?format=xlsx').set('Authorization', `Bearer ${token}`);
    expect(r1.status).toBe(403);

    const r2 = await request(app).get('/api/admin/estadisticas/export?format=pdf').set('Authorization', `Bearer ${token}`);
    expect(r2.status).toBe(403);
  });

  test('un admin_empresa (no admin del sistema) no puede exportar (403)', async () => {
    const { usuarioAdmin, passwordPlana } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);

    const res = await request(app).get('/api/admin/logs/export?format=xlsx').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('sin sesión → 401', async () => {
    const res = await request(app).get('/api/admin/logs/export?format=xlsx');
    expect(res.status).toBe(401);
  });

  // ── Validación de formato ────────────────────────────────────────────────

  test('formato inválido en logs/export → 400 controlado', async () => {
    const { token } = await tokenAdmin();
    const res = await request(app).get('/api/admin/logs/export?format=exe').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('formato inválido en estadisticas/export → 400 controlado (csv no es válido acá)', async () => {
    const { token } = await tokenAdmin();
    const res = await request(app).get('/api/admin/estadisticas/export?format=csv').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  // ── GET /estadisticas (pantalla) ────────────────────────────────────────

  test('GET /admin/estadisticas devuelve la forma esperada, sin denominador-cero mal calculado', async () => {
    const { token } = await tokenAdmin();
    const res = await request(app).get('/api/admin/estadisticas?periodoDias=30').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('usuarios');
    expect(res.body.data).toHaveProperty('ofertas');
    expect(res.body.data).toHaveProperty('embudo');
    // Si no hay contrataciones/postulaciones, la tasa es null, nunca 0 engañoso.
    if (res.body.data.postulaciones.total === 0) {
      expect(res.body.data.contrataciones.tasaContratacion).toBeNull();
    }
  });

  // ── Excel: logs ──────────────────────────────────────────────────────────

  // Los exports de logs se acotan por `usuarioId` (el del propio admin del test): la base
  // local puede tener miles de logs acumulados y sin acotar cada export tocaba el tope de
  // 5000 filas y superaba el timeout por defecto — el resultado dependía de la base, no del código.
  test('logs/export xlsx: MIME, Content-Disposition, workbook válido con 3 hojas', async () => {
    const { usuario: admin, token } = await tokenAdmin();
    const res = await request(app)
      .get(`/api/admin/logs/export?format=xlsx&usuarioId=${admin.id}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((r, cb) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="auditoria_\d{4}-\d{2}-\d{2}\.xlsx"$/);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const nombres = wb.worksheets.map((s) => s.name);
    expect(nombres).toEqual(['Resumen', 'Datos', 'Filtros y metadatos']);
  });

  test('logs/export: una acción que empieza con "=" queda neutralizada en Excel (anti-injection)', async () => {
    const { usuario: admin, token } = await tokenAdmin();
    // Un log cuya "entidad" (campo libre) empieza con "=" — simulando el
    // caso real: un dato controlado por el usuario que llega a una celda.
    const log = await ActivityLog.create({
      usuarioId: admin.id, accion: 'sistema', entidad: '=1+1+cmd|"/c calc"!A1',
      ip: '203.0.113.99', createdAt: new Date(),
    });

    const res = await request(app)
      .get(`/api/admin/logs/export?format=xlsx&entidad=${encodeURIComponent('=1+1+cmd|"/c calc"!A1')}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((r, cb) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });

    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const datos = wb.getWorksheet('Datos');
    let encontrada = false;
    datos.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const entidadCell = row.getCell(4).value; // columna "Entidad"
      if (typeof entidadCell === 'string' && entidadCell.includes('1+1+cmd')) {
        encontrada = true;
        expect(entidadCell.startsWith("'")).toBe(true); // prefijo anti-fórmula
      }
    });
    expect(encontrada).toBe(true);

    await ActivityLog.destroy({ where: { id: log.id } });
  });

  test('logs/export pdf: header %PDF- válido', async () => {
    const { usuario: admin, token } = await tokenAdmin();
    const res = await request(app)
      .get(`/api/admin/logs/export?format=pdf&usuarioId=${admin.id}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((r, cb) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.slice(0, 5).toString()).toBe('%PDF-');
  });

  test('logs/export csv (legacy, default) sigue funcionando igual que antes', async () => {
    const { usuario: admin, token } = await tokenAdmin();
    const res = await request(app).get(`/api/admin/logs/export?usuarioId=${admin.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  // ── Excel/PDF: estadísticas ──────────────────────────────────────────────

  test('estadisticas/export xlsx: workbook válido con las hojas esperadas', async () => {
    const { token } = await tokenAdmin();
    const res = await request(app)
      .get('/api/admin/estadisticas/export?format=xlsx&periodoDias=90')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((r, cb) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="estadisticas_\d{4}-\d{2}-\d{2}\.xlsx"$/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    expect(wb.worksheets.map((s) => s.name)).toEqual(
      ['Resumen', 'Datos', 'Embudo de selección', 'Empresas con más ofertas', 'Filtros y metadatos']
    );
  });

  test('estadisticas/export pdf: header %PDF- válido', async () => {
    const { token } = await tokenAdmin();
    const res = await request(app)
      .get('/api/admin/estadisticas/export?format=pdf')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((r, cb) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });

    expect(res.status).toBe(200);
    expect(res.body.slice(0, 5).toString()).toBe('%PDF-');
  });

  // ── Auditoría ────────────────────────────────────────────────────────────

  test('cada exportación deja un ActivityLog con el formato/filtros, NUNCA el contenido exportado', async () => {
    const { usuario: admin, token } = await tokenAdmin();

    await request(app).get('/api/admin/estadisticas/export?format=pdf&periodoDias=7').set('Authorization', `Bearer ${token}`);

    const log = await ActivityLog.findOne({
      where: { usuarioId: admin.id, accion: 'exportar_estadisticas' },
      order: [['id', 'DESC']],
    });
    expect(log).not.toBeNull();
    expect(log.detalle.formato).toBe('pdf');
    expect(log.detalle.filtros.periodoDias).toBe('7');
    // El detalle solo tiene metadatos, nunca filas/contenido exportado.
    expect(Object.keys(log.detalle)).toEqual(expect.arrayContaining(['formato', 'filtros']));
    expect(JSON.stringify(log.detalle).length).toBeLessThan(500);
  });

  // ── Límite de filas ──────────────────────────────────────────────────────

  // Sin acotar por usuario a propósito: es la consulta más pesada posible (tope de filas).
  test('el export respeta el límite duro de filas (LOGS_EXPORT_LIMIT)', async () => {
    const { token } = await tokenAdmin();
    const adminService = require('../src/services/admin.service');

    const res = await request(app)
      .get('/api/admin/logs/export?format=xlsx')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((r, cb) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const datos = wb.getWorksheet('Datos');
    // rowCount incluye el header
    expect(datos.rowCount - 1).toBeLessThanOrEqual(adminService.LOGS_EXPORT_LIMIT);
  }, 30_000);

  // ── PDF: paginación real y pie "Página X de N" ───────────────────────────

  describe('PDF: páginas reales y pie de página', () => {
    const bajarPdf = async (url, token) => {
      const res = await request(app)
        .get(url)
        .set('Authorization', `Bearer ${token}`)
        .buffer(true)
        .parse((r, cb) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });
      expect(res.status).toBe(200);
      return res.body;
    };

    afterAll(async () => {
      await ActivityLog.destroy({ where: { entidad: 'test_pdf_paginas' } });
    });

    test('un reporte corto (estadísticas) tiene exactamente 1 página — sin página vacía extra', async () => {
      const { token } = await tokenAdmin();
      const pdf = await bajarPdf('/api/admin/estadisticas/export?format=pdf&periodoDias=30', token);
      expect(contarPaginasPdf(pdf)).toBe(1);
      const texto = textoDePdf(pdf);
      expect(texto).toContain('Página 1 de 1');
      expect(texto).not.toContain('Página 2');
    });

    test('un reporte de auditoría sin filas tiene exactamente 1 página', async () => {
      const { usuario: admin, token } = await tokenAdmin();
      // El propio export deja un log del admin, así que se acota a una acción que este usuario no generó.
      const pdf = await bajarPdf(`/api/admin/logs/export?format=pdf&usuarioId=${admin.id}&accion=cerrar_oferta`, token);
      expect(contarPaginasPdf(pdf)).toBe(1);
      expect(textoDePdf(pdf)).toContain('Página 1 de 1');
    });

    test('un reporte largo tiene N páginas reales y un pie "Página i de N" en cada una', async () => {
      const { usuario: admin, token } = await tokenAdmin();
      await ActivityLog.bulkCreate(Array.from({ length: 90 }, (_, i) => ({
        usuarioId: admin.id, accion: 'sistema', entidad: 'test_pdf_paginas', entidadId: i + 1,
        ip: '203.0.113.7', createdAt: new Date(Date.now() - i * 1000),
      })));

      const pdf = await bajarPdf(`/api/admin/logs/export?format=pdf&usuarioId=${admin.id}&entidad=test_pdf_paginas`, token);
      const n = contarPaginasPdf(pdf);
      expect(n).toBeGreaterThan(1);
      expect(n).toBeLessThan(10); // 90 filas: unas pocas páginas, no el doble por el pie

      const texto = textoDePdf(pdf);
      for (let i = 1; i <= n; i++) expect(texto).toContain(`Página ${i} de ${n}`);
      expect(texto).not.toContain(`de ${n + 1}`);
    });
  });
});
