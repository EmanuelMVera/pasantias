'use strict';

/**
 * uploads.test.js — SEC-03.
 *
 * Endurecimiento de subidas de imagen (foto de perfil, logo de empresa):
 * MIME allowlist, magic bytes, tamaño, nombre server-side, cleanup del anterior.
 */

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/app');
const { Perfil, Usuario, Archivo, Empresa } = require('../src/models');
const { PUBLIC_DIR } = require('../src/services/archivoImagen.service');
const { crearAlumno, crearEmpresaConAdmin, agregarReclutador, loginYObtenerToken } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

// Buffers mínimos que pasan firmaCoincide (magic bytes).
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const bn = (url) => path.basename(String(url).split('?')[0]);

describe('SEC-03 — Subida de imágenes', () => {
  const idsUsuarios = [];
  const archivosPublicos = [];

  afterAll(async () => {
    for (const b of archivosPublicos) { try { fs.rmSync(path.join(PUBLIC_DIR, b), { force: true }); } catch { /* nada */ } }
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  // ── foto de perfil ──────────────────────────────────────────────────────────
  test('PNG real → 200, URL absoluta a /uploads/public y sync en Perfil + Usuario', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);
    const token = await loginYObtenerToken(usuario.email, passwordPlana);

    const res = await request(app)
      .post('/api/users/perfil/foto')
      .set('Authorization', `Bearer ${token}`)
      .attach('foto', PNG, { filename: 'mi foto.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    // DEPLOY-01: la key ahora es aleatoria (UUID), sin el id del usuario.
    expect(res.body.fotoPerfil).toMatch(/^https?:\/\/.+\/uploads\/public\/foto_[0-9a-f-]+\.png$/);
    archivosPublicos.push(bn(res.body.fotoPerfil));

    const perfil = await Perfil.findOne({ where: { usuarioId: usuario.id }, attributes: ['fotoPerfil'] });
    const u = await Usuario.findByPk(usuario.id, { attributes: ['fotoPerfil'] });
    expect(perfil.fotoPerfil).toBe(res.body.fotoPerfil);
    expect(u.fotoPerfil).toBe(res.body.fotoPerfil);
    expect(fs.existsSync(path.join(PUBLIC_DIR, bn(res.body.fotoPerfil)))).toBe(true);

    // La URL guardada se sirve por el estático público, con nosniff.
    const servida = await request(app).get(`/uploads/public/${bn(res.body.fotoPerfil)}`);
    expect(servida.status).toBe(200);
    expect(servida.headers['content-type']).toMatch(/image\/png/);
    expect(servida.headers['x-content-type-options']).toBe('nosniff');
  });

  test('Content-Type image/png pero contenido SVG → 400 y nada queda en disco', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);
    const token = await loginYObtenerToken(usuario.email, passwordPlana);

    const antes = fs.readdirSync(PUBLIC_DIR).filter((f) => f.startsWith('foto_'));
    const res = await request(app)
      .post('/api/users/perfil/foto')
      .set('Authorization', `Bearer ${token}`)
      .attach('foto', Buffer.from('<svg onload=alert(1)></svg>'), { filename: 'x.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no coincide/i);
    // memoryStorage + validación previa: nada se sube si los magic bytes fallan.
    const despues = fs.readdirSync(PUBLIC_DIR).filter((f) => f.startsWith('foto_'));
    expect(despues).toEqual(antes);
  });

  test('Content-Type image/svg+xml → 400 (fileFilter)', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);
    const token = await loginYObtenerToken(usuario.email, passwordPlana);

    const res = await request(app)
      .post('/api/users/perfil/foto')
      .set('Authorization', `Bearer ${token}`)
      .attach('foto', Buffer.from('<svg></svg>'), { filename: 'x.svg', contentType: 'image/svg+xml' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/im[aá]genes/i);
  });

  test('imagen > 2 MB → 400 (LIMIT_FILE_SIZE)', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);
    const token = await loginYObtenerToken(usuario.email, passwordPlana);

    const grande = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    const res = await request(app)
      .post('/api/users/perfil/foto')
      .set('Authorization', `Bearer ${token}`)
      .attach('foto', grande, { filename: 'grande.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/tama[ñn]o/i);
  });

  test('subir foto B reemplaza a A: el archivo y la fila Archivo de A se borran', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);
    const token = await loginYObtenerToken(usuario.email, passwordPlana);

    const a = await request(app).post('/api/users/perfil/foto')
      .set('Authorization', `Bearer ${token}`)
      .attach('foto', PNG, { filename: 'a.png', contentType: 'image/png' });
    const b = await request(app).post('/api/users/perfil/foto')
      .set('Authorization', `Bearer ${token}`)
      .attach('foto', JPEG, { filename: 'b.jpg', contentType: 'image/jpeg' });

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    archivosPublicos.push(bn(a.body.fotoPerfil), bn(b.body.fotoPerfil));

    expect(fs.existsSync(path.join(PUBLIC_DIR, bn(a.body.fotoPerfil)))).toBe(false);
    expect(fs.existsSync(path.join(PUBLIC_DIR, bn(b.body.fotoPerfil)))).toBe(true);
    expect(await Archivo.count({ where: { claveAlmacenamiento: `/uploads/public/${bn(a.body.fotoPerfil)}` } })).toBe(0);
    expect(await Archivo.count({ where: { claveAlmacenamiento: `/uploads/public/${bn(b.body.fotoPerfil)}` } })).toBe(1);
  });

  test('PUT /api/users/perfil con fotoPerfil string malicioso → se ignora', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);
    const token = await loginYObtenerToken(usuario.email, passwordPlana);

    const res = await request(app)
      .put('/api/users/perfil')
      .set('Authorization', `Bearer ${token}`)
      .send({ carrera: 'Sistemas', fotoPerfil: 'javascript:alert(1)' });

    expect(res.status).toBe(200);
    const perfil = await Perfil.findOne({ where: { usuarioId: usuario.id }, attributes: ['fotoPerfil', 'carrera'] });
    expect(perfil.carrera).toBe('Sistemas');
    expect(perfil.fotoPerfil).not.toBe('javascript:alert(1)');
  });

  // ── logo de empresa ─────────────────────────────────────────────────────────
  test('logo: admin_empresa con JPEG real → 200; reclutador → 403', async () => {
    const { usuarioAdmin, empresa, passwordPlana } = await crearEmpresaConAdmin();
    const { usuarioReclutador } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioAdmin.id, usuarioReclutador.id);

    const tokenAdmin = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);
    const tokenRecl = await loginYObtenerToken(usuarioReclutador.email, passwordPlana);

    const ok = await request(app).post('/api/empresas/mi-empresa/logo')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .attach('logo', JPEG, { filename: 'logo.jpg', contentType: 'image/jpeg' });
    expect(ok.status).toBe(200);
    expect(ok.body.logo).toMatch(/\/uploads\/public\/logo_[0-9a-f-]+\.jpg$/);
    archivosPublicos.push(bn(ok.body.logo));
    const emp = await Empresa.findByPk(empresa.id, { attributes: ['logo'] });
    expect(emp.logo).toBe(ok.body.logo);

    const denegado = await request(app).post('/api/empresas/mi-empresa/logo')
      .set('Authorization', `Bearer ${tokenRecl}`)
      .attach('logo', JPEG, { filename: 'logo.jpg', contentType: 'image/jpeg' });
    expect(denegado.status).toBe(403);
  });
});
