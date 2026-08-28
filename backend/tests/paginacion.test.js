'use strict';

/**
 * paginacion.test.js — SCALE-03.
 *
 * Verifica el contrato común de paginación (?page=&limit= →
 * { data, pagination: { page, limit, total, totalPages } }) sobre endpoints
 * representativos: listado público, listado admin con include hasMany
 * (distinct), y sidecar conteoPorEstado + filtro server-side.
 */

const request = require('supertest');
const app = require('../src/app');
const {
  crearAlumno, crearAdmin, crearEmpresaConAdmin, crearOferta, loginYObtenerToken,
} = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');
const { Postulacion, Notificacion } = require('../src/models');

describe('SCALE-03 · Paginación', () => {
  const idsUsuarios = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  // ── GET /api/ofertas (público) ────────────────────────────────────────────
  describe('GET /api/ofertas', () => {
    let empresa;
    beforeAll(async () => {
      const e = await crearEmpresaConAdmin();
      idsUsuarios.push(e.usuarioAdmin.id);
      empresa = e.empresa;
      // 15 ofertas activas + moderadas
      for (let i = 0; i < 15; i++) await crearOferta(empresa, { titulo: `SCALE03 oferta ${i}` });
    });

    test('sin params → pagination con defaults y data acotada', async () => {
      const res = await request(app).get('/api/ofertas?ciudad=&q=SCALE03');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toMatchObject({ page: 1, limit: 12 });
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(15);
      expect(res.body.data.length).toBe(12);
      expect(res.body.pagination.totalPages).toBe(
        Math.ceil(res.body.pagination.total / 12)
      );
      // alias @deprecated
      expect(res.body.total).toBe(res.body.pagination.total);
    });

    test('limit fuera de rango → clampeado al máximo (anti limit=100000)', async () => {
      const res = await request(app).get('/api/ofertas?limit=100000&q=SCALE03');
      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(48);
      expect(res.body.data.length).toBeLessThanOrEqual(48);
    });

    test('page fuera de rango → data vacía, pagination válida', async () => {
      const res = await request(app).get('/api/ofertas?page=9999&q=SCALE03');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(15);
      expect(res.body.pagination.totalPages).toBeGreaterThanOrEqual(1);
    });

    test('dos páginas consecutivas no se solapan', async () => {
      const p1 = await request(app).get('/api/ofertas?q=SCALE03&limit=8&page=1');
      const p2 = await request(app).get('/api/ofertas?q=SCALE03&limit=8&page=2');
      const ids1 = p1.body.data.map((o) => o.id);
      const ids2 = p2.body.data.map((o) => o.id);
      expect(ids1.filter((id) => ids2.includes(id))).toEqual([]);
    });
  });

  // ── GET /api/admin/usuarios (include hasMany → distinct) ───────────────────
  describe('GET /api/admin/usuarios', () => {
    test('el total no se infla por el include membresiasEmpresa (distinct)', async () => {
      const { usuarioAdmin } = await crearEmpresaConAdmin(); // usuario empresa con 1 membresía
      idsUsuarios.push(usuarioAdmin.id);
      const { usuario: admin, passwordPlana } = await crearAdmin();
      idsUsuarios.push(admin.id);
      const token = await loginYObtenerToken(admin.email, passwordPlana);

      const res = await request(app)
        .get('/api/admin/usuarios?rol=empresa&limit=100')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination).toBeDefined();
      // total == filas devueltas cuando todo entra en una página
      expect(res.body.pagination.total).toBe(res.body.data.length);
      // sin duplicados por el join
      const ids = res.body.data.map((u) => u.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // ── GET /api/postulaciones/oferta/:id (conteoPorEstado + filtro estado) ────
  describe('GET /api/postulaciones/oferta/:ofertaId', () => {
    test('conteoPorEstado refleja todo el set; filtro estado ajusta pagination.total', async () => {
      const { usuarioAdmin, empresa, passwordPlana } = await crearEmpresaConAdmin();
      idsUsuarios.push(usuarioAdmin.id);
      const oferta = await crearOferta(empresa);

      // 3 postulaciones en_revision + 2 preseleccionado
      for (let i = 0; i < 5; i++) {
        const { usuario } = await crearAlumno();
        idsUsuarios.push(usuario.id);
        await Postulacion.create({
          usuarioId: usuario.id,
          ofertaId: oferta.id,
          estado: i < 3 ? 'en_revision' : 'preseleccionado',
        });
      }

      const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);

      const todas = await request(app)
        .get(`/api/postulaciones/oferta/${oferta.id}?limit=2`)
        .set('Authorization', `Bearer ${token}`);
      expect(todas.status).toBe(200);
      expect(todas.body.data.length).toBe(2); // limitado
      expect(todas.body.pagination.total).toBe(5);
      expect(todas.body.conteoPorEstado).toMatchObject({ en_revision: 3, preseleccionado: 2 });

      const filtradas = await request(app)
        .get(`/api/postulaciones/oferta/${oferta.id}?estado=preseleccionado`)
        .set('Authorization', `Bearer ${token}`);
      expect(filtradas.body.pagination.total).toBe(2);
      expect(filtradas.body.data.every((p) => p.estado === 'preseleccionado')).toBe(true);
      // el sidecar sigue contando TODO el set, no el filtrado
      expect(filtradas.body.conteoPorEstado).toMatchObject({ en_revision: 3, preseleccionado: 2 });
    });
  });

  // ── GET /api/notificaciones (filtro leida server-side) ────────────────────
  describe('GET /api/notificaciones', () => {
    test('?leida=false filtra y pagination.total lo refleja', async () => {
      const { usuario, passwordPlana } = await crearAlumno();
      idsUsuarios.push(usuario.id);
      await Notificacion.bulkCreate([
        { usuarioId: usuario.id, titulo: 'a', mensaje: 'x', tipo: 'sistema', leida: false },
        { usuarioId: usuario.id, titulo: 'b', mensaje: 'x', tipo: 'sistema', leida: false },
        { usuarioId: usuario.id, titulo: 'c', mensaje: 'x', tipo: 'sistema', leida: true },
      ]);
      const token = await loginYObtenerToken(usuario.email, passwordPlana);

      const noLeidas = await request(app)
        .get('/api/notificaciones?leida=false')
        .set('Authorization', `Bearer ${token}`);
      expect(noLeidas.status).toBe(200);
      expect(noLeidas.body.pagination.total).toBe(2);
      expect(noLeidas.body.data.every((n) => n.leida === false)).toBe(true);
      expect(noLeidas.body.sinLeer).toBe(2);

      const todas = await request(app)
        .get('/api/notificaciones')
        .set('Authorization', `Bearer ${token}`);
      expect(todas.body.pagination.total).toBe(3);
    });
  });
});
