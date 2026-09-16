'use strict';

/**
 * storage.test.js — DEPLOY-01.
 *
 * Abstracción de almacenamiento (src/services/storage). El backend `s3` se
 * ejercita con el AWS SDK v3 MOCKEADO — nunca se llama a R2/S3 real.
 *
 * El resto de la suite (uploads.test.js, archivo.test.js, seguridad.test.js,
 * user.test.js) corre con STORAGE_BACKEND sin setear → backend `local`, así que
 * la compatibilidad local ya está cubierta ahí; acá se agrega una verificación
 * explícita.
 */

// ── Config de S3 para el archivo (antes de requerir src/*) ───────────────────
// process.env es GLOBAL al proceso (jest --runInBand) → se restaura en afterAll
// para no contaminar los archivos de test que corren después.
const S3_ENV = {
  STORAGE_BACKEND: 's3',
  S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
  S3_BUCKET: 'test-priv',
  S3_PUBLIC_BUCKET: 'test-pub',
  S3_ACCESS_KEY_ID: 'test-key',
  S3_SECRET_ACCESS_KEY: 'test-secret',
  S3_PUBLIC_BASE_URL: 'https://cdn.test.example',
  S3_KEY_PREFIX: 'sispasantias',
};
const _envPrevio = {};
for (const [k, v] of Object.entries(S3_ENV)) { _envPrevio[k] = process.env[k]; process.env[k] = v; }

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => {
  const cmd = (name) => class {
    constructor(input) { this.__cmd = name; this.input = input; }
  };
  return {
    S3Client: jest.fn(() => ({ send: mockSend })),
    PutObjectCommand: cmd('Put'),
    GetObjectCommand: cmd('Get'),
    DeleteObjectCommand: cmd('Delete'),
    HeadObjectCommand: cmd('Head'),
  };
});

const request = require('supertest');
const app = require('../src/app');
const storage = require('../src/services/storage');
const { PUBLIC_DIR } = require('../src/services/archivoImagen.service');
const { Archivo, Perfil } = require('../src/models');
const { crearAlumno, loginYObtenerToken } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n');

const cmdsDe = (tipo) => mockSend.mock.calls.map(([c]) => c).filter((c) => c.__cmd === tipo);

describe('storage — backend s3 (AWS SDK mockeado)', () => {
  const ids = [];
  const archivosLocales = [];

  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
    process.env.STORAGE_BACKEND = 's3';
  });

  afterAll(async () => {
    for (const b of archivosLocales) { try { fs.rmSync(path.join(PUBLIC_DIR, b), { force: true }); } catch { /* nada */ } }
    await limpiarUsuarios(ids);
    await cerrarConexion();
    // Restaura process.env para los archivos de test siguientes.
    for (const [k, v] of Object.entries(_envPrevio)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  // ── adapter s3 unitario ────────────────────────────────────────────────────
  test('putObject privado → PutObjectCommand al bucket privado', async () => {
    await storage.get('s3').putObject({ key: 'sispasantias/cv/x.pdf', body: PDF, contentType: 'application/pdf', area: 'private' });
    const put = cmdsDe('Put')[0];
    expect(put.input).toMatchObject({ Bucket: 'test-priv', Key: 'sispasantias/cv/x.pdf', ContentType: 'application/pdf' });
  });

  test('putObject público → PutObjectCommand al bucket público', async () => {
    await storage.get('s3').putObject({ key: 'sispasantias/foto_perfil/x.png', body: PNG, contentType: 'image/png', area: 'public' });
    expect(cmdsDe('Put')[0].input.Bucket).toBe('test-pub');
  });

  test('getObjectStream devuelve el Body y el contentType', async () => {
    mockSend.mockResolvedValueOnce({ Body: Readable.from(['hola']), ContentType: 'image/png' });
    const { stream, contentType } = await storage.get('s3').getObjectStream('k', { area: 'private' });
    expect(contentType).toBe('image/png');
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    expect(Buffer.concat(chunks.map(Buffer.from)).toString()).toBe('hola');
  });

  test('getObjectStream con NoSuchKey → error.notFound', async () => {
    mockSend.mockRejectedValueOnce(Object.assign(new Error('nope'), { name: 'NoSuchKey' }));
    await expect(storage.get('s3').getObjectStream('k')).rejects.toMatchObject({ notFound: true });
  });

  test('deleteObject → DeleteObjectCommand; borrar algo inexistente no tira', async () => {
    await storage.get('s3').deleteObject('k', { area: 'public' });
    expect(cmdsDe('Delete')[0].input).toMatchObject({ Bucket: 'test-pub', Key: 'k' });
    mockSend.mockRejectedValueOnce(Object.assign(new Error(), { name: 'NoSuchKey' }));
    await expect(storage.get('s3').deleteObject('k')).resolves.toBeUndefined();
  });

  test('objectExists: Head OK → true; Head 404 → false', async () => {
    expect(await storage.get('s3').objectExists('k')).toBe(true);
    mockSend.mockRejectedValueOnce(Object.assign(new Error(), { $metadata: { httpStatusCode: 404 } }));
    expect(await storage.get('s3').objectExists('k')).toBe(false);
  });

  test('publicUrl usa S3_PUBLIC_BASE_URL', () => {
    expect(storage.get('s3').publicUrl('sispasantias/foto_perfil/x.png'))
      .toBe('https://cdn.test.example/sispasantias/foto_perfil/x.png');
  });

  // ── storage/index ──────────────────────────────────────────────────────────
  test('keyFor genera keys aleatorias con prefijo y tipo', () => {
    const k = storage.keyFor('public', { tipo: 'foto_perfil', ext: '.png' });
    expect(k).toMatch(/^sispasantias\/foto_perfil\/[0-9a-f-]{36}\.png$/);
    expect(storage.keyFor('public', { tipo: 'foto_perfil', ext: '.png' })).not.toBe(k);
  });

  test('keyFor sanitiza la extensión', () => {
    expect(storage.keyFor('private', { tipo: 'cv', ext: '../evil' })).toMatch(/\.bin$/);
  });

  test('claveDesdeUrlPublica: s3, local y externa', () => {
    expect(storage.claveDesdeUrlPublica('https://cdn.test.example/sispasantias/foto_perfil/x.png'))
      .toBe('sispasantias/foto_perfil/x.png');
    expect(storage.claveDesdeUrlPublica('http://localhost:5000/uploads/public/foto_abc.png'))
      .toBe('/uploads/public/foto_abc.png');
    expect(storage.claveDesdeUrlPublica('https://i.pravatar.cc/150?u=1')).toBeNull();
  });

  test('primary respeta STORAGE_BACKEND en vivo', () => {
    expect(storage.primaryName).toBe('s3');
    process.env.STORAGE_BACKEND = 'local';
    expect(storage.primaryName).toBe('local');
    expect(storage.primary.name).toBe('local');
    process.env.STORAGE_BACKEND = 's3';
  });

  // ── integración: upload privado (CV) ───────────────────────────────────────
  test('POST /perfil/cv → sube al bucket privado y registra Archivo backend=s3', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    ids.push(usuario.id);
    const token = await loginYObtenerToken(usuario.email, passwordPlana);

    const res = await request(app).post('/api/users/perfil/cv')
      .set('Authorization', `Bearer ${token}`)
      .attach('cv', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.cvArchivoId).toBeTruthy();
    const put = cmdsDe('Put')[0];
    expect(put.input.Bucket).toBe('test-priv');
    expect(put.input.Key).toMatch(/^sispasantias\/cv\/[0-9a-f-]{36}\.pdf$/);

    const archivo = await Archivo.findByPk(res.body.cvArchivoId);
    expect(archivo.backend).toBe('s3');
    expect(archivo.claveAlmacenamiento).toBe(put.input.Key);
  });

  // ── integración: download autorizado / denegado ───────────────────────────
  test('GET /api/archivos/:id (backend s3): propietario 200 con bytes; extraño 404', async () => {
    const { usuario: duenio, passwordPlana } = await crearAlumno();
    const { usuario: otro } = await crearAlumno();
    ids.push(duenio.id, otro.id);

    const archivo = await Archivo.create({
      usuarioPropietarioId: duenio.id,
      tipo: 'cv',
      nombreOriginal: 'cv.pdf',
      claveAlmacenamiento: 'sispasantias/cv/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.pdf',
      mimeType: 'application/pdf',
      backend: 's3',
    });

    mockSend.mockResolvedValue({ Body: Readable.from(['PDFBYTES']), ContentType: 'application/pdf' });

    const tokenDuenio = await loginYObtenerToken(duenio.email, passwordPlana);
    const ok = await request(app).get(`/api/archivos/${archivo.id}`)
      .set('Authorization', `Bearer ${tokenDuenio}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(Buffer.from(c)));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(ok.status).toBe(200);
    expect(ok.body.toString()).toBe('PDFBYTES');
    expect(cmdsDe('Get')[0].input).toMatchObject({ Bucket: 'test-priv', Key: archivo.claveAlmacenamiento });

    const tokenOtro = await loginYObtenerToken(otro.email);
    const denegado = await request(app).get(`/api/archivos/${archivo.id}`).set('Authorization', `Bearer ${tokenOtro}`);
    expect(denegado.status).toBe(404);
  });

  // ── integración: imagen pública ───────────────────────────────────────────
  test('POST /perfil/foto → sube al bucket público, URL desde S3_PUBLIC_BASE_URL', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    ids.push(usuario.id);
    const token = await loginYObtenerToken(usuario.email, passwordPlana);

    const res = await request(app).post('/api/users/perfil/foto')
      .set('Authorization', `Bearer ${token}`)
      .attach('foto', PNG, { filename: 'f.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.fotoPerfil).toMatch(/^https:\/\/cdn\.test\.example\/sispasantias\/foto_perfil\/[0-9a-f-]{36}\.png$/);
    expect(cmdsDe('Put')[0].input.Bucket).toBe('test-pub');
  });

  // ── integración: reemplazo → delete remoto ────────────────────────────────
  test('reemplazar la foto borra el objeto anterior en S3 y su fila', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    ids.push(usuario.id);
    const token = await loginYObtenerToken(usuario.email, passwordPlana);

    const a = await request(app).post('/api/users/perfil/foto').set('Authorization', `Bearer ${token}`)
      .attach('foto', PNG, { filename: 'a.png', contentType: 'image/png' });
    const keyA = storage.claveDesdeUrlPublica(a.body.fotoPerfil);

    mockSend.mockClear();
    const b = await request(app).post('/api/users/perfil/foto').set('Authorization', `Bearer ${token}`)
      .attach('foto', JPEG, { filename: 'b.jpg', contentType: 'image/jpeg' });
    expect(b.status).toBe(200);

    expect(cmdsDe('Delete').some((c) => c.input.Key === keyA && c.input.Bucket === 'test-pub')).toBe(true);
    expect(await Archivo.count({ where: { claveAlmacenamiento: keyA } })).toBe(0);
  });

  // ── integración: fallo de S3 antes de escribir DB ─────────────────────────
  test('si falla el PutObject, NO se crea la fila Archivo y responde 500', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    ids.push(usuario.id);
    const token = await loginYObtenerToken(usuario.email, passwordPlana);

    mockSend.mockImplementation((cmd) => {
      if (cmd.__cmd === 'Put') return Promise.reject(new Error('S3 caído'));
      return Promise.resolve({});
    });

    const res = await request(app).post('/api/users/perfil/foto').set('Authorization', `Bearer ${token}`)
      .attach('foto', PNG, { filename: 'f.png', contentType: 'image/png' });

    expect(res.status).toBe(500);
    expect(await Archivo.count({ where: { usuarioPropietarioId: usuario.id, tipo: 'foto_perfil' } })).toBe(0);
  });

  // ── integración: falla la DB después de subir → cleanup del objeto ────────
  test('si falla Archivo.create tras el PutObject, se borra el objeto y responde 500', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    ids.push(usuario.id);
    const token = await loginYObtenerToken(usuario.email, passwordPlana);

    const spy = jest.spyOn(Archivo, 'create').mockRejectedValueOnce(new Error('DB down'));

    const res = await request(app).post('/api/users/perfil/foto').set('Authorization', `Bearer ${token}`)
      .attach('foto', PNG, { filename: 'f.png', contentType: 'image/png' });

    expect(res.status).toBe(500);
    expect(cmdsDe('Delete').length).toBeGreaterThan(0); // compensación
    spy.mockRestore();
  });

  // ── STORAGE_BACKEND=local sigue funcionando ───────────────────────────────
  test('con STORAGE_BACKEND=local la subida usa el disco (no S3)', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    ids.push(usuario.id);
    const token = await loginYObtenerToken(usuario.email, passwordPlana);

    process.env.STORAGE_BACKEND = 'local';
    try {
      const res = await request(app).post('/api/users/perfil/foto').set('Authorization', `Bearer ${token}`)
        .attach('foto', PNG, { filename: 'f.png', contentType: 'image/png' });
      expect(res.status).toBe(200);
      expect(res.body.fotoPerfil).toMatch(/\/uploads\/public\/foto_[0-9a-f-]+\.png$/);
      expect(mockSend).not.toHaveBeenCalled();
      archivosLocales.push(path.basename(res.body.fotoPerfil));
      const perfil = await Perfil.findOne({ where: { usuarioId: usuario.id }, attributes: ['fotoPerfil'] });
      const archivo = await Archivo.findOne({ where: { claveAlmacenamiento: storage.claveDesdeUrlPublica(perfil.fotoPerfil) } });
      expect(archivo.backend).toBe('local');
    } finally {
      process.env.STORAGE_BACKEND = 's3';
    }
  });
});

// ── esUrlImagenExternaValida — validador de URL externa (foto/logo) ──────────
// Función pura, sin dependencia de storage/S3 — no necesita el mock de arriba.
describe('esUrlImagenExternaValida', () => {
  const { esUrlImagenExternaValida } = require('../src/validators/common.validator');

  test.each([
    'https://i.pravatar.cc/150?img=5',
    'https://ui-avatars.com/api/?name=Test',
    'https://sub.dominio.com.ar/foto.png',
  ])('%s → válida', (url) => {
    expect(esUrlImagenExternaValida(url)).toBe(true);
  });

  test.each([
    [undefined, 'undefined'],
    [null, 'null'],
    [123, 'no-string'],
    ['', 'vacía'],
    ['http://ejemplo.com/foto.png', 'http (no https)'],
    ['ftp://ejemplo.com/foto.png', 'protocolo ftp'],
    ['data:image/png;base64,aaaa', 'data:'],
    ['javascript:alert(1)', 'javascript:'],
    ['file:///etc/passwd', 'file:'],
    ['https://localhost/foto.png', 'localhost'],
    ['https://127.0.0.1/foto.png', 'loopback IPv4'],
    ['https://169.254.169.254/latest/meta-data', 'metadata de nube (link-local)'],
    ['https://192.168.1.5/foto.png', 'IP privada 192.168.x.x'],
    ['https://10.0.0.5/foto.png', 'IP privada 10.x.x.x'],
    ['https://172.16.0.5/foto.png', 'IP privada 172.16-31.x.x'],
    ['https://user:pass@ejemplo.com/foto.png', 'URL con userinfo embebido'],
    ['https://noesundominio/foto.png', 'hostname sin punto'],
    [`https://ejemplo.com/${'a'.repeat(260)}.png`, 'URL de más de 255 caracteres'],
    ['no-es-una-url', 'string no parseable como URL'],
  ])('%s (%s) → inválida', (url) => {
    expect(esUrlImagenExternaValida(url)).toBe(false);
  });
});
