'use strict';

/**
 * config.test.js — DEPLOY-01.
 *
 * Configuración centralizada (src/config/env.js) y opciones de Sequelize
 * (src/config/database.js). Puro: no toca la base.
 */

const { loadConfig, validateConfig } = require('../src/config/env');
const { buildSequelizeOptions } = require('../src/config/database');

const PROD_OK = {
  NODE_ENV: 'production',
  JWT_SECRET: 'x'.repeat(40),
  CLIENT_URL: 'https://app.vercel.app',
  ALLOWED_ORIGINS: 'https://app.vercel.app',
  DATABASE_URL: 'postgres://u:p@h.neon.tech/db?sslmode=require',
  PUBLIC_URL: 'https://api.onrender.com',
};

describe('config/env — precedencia de base de datos', () => {
  test('DATABASE_URL tiene prioridad sobre DB_*', () => {
    const c = loadConfig({ DATABASE_URL: 'postgres://a:b@c/d', DB_NAME: 'local', DB_USER: 'u', DB_PASSWORD: 'p' });
    expect(c.db.url).toBe('postgres://a:b@c/d');
  });

  test('sin DATABASE_URL usa las DB_* sueltas', () => {
    const c = loadConfig({ DB_HOST: 'h', DB_NAME: 'n', DB_USER: 'u', DB_PASSWORD: 'p', DB_PORT: '6543' });
    expect(c.db.url).toBeUndefined();
    expect(c.db).toMatchObject({ host: 'h', name: 'n', user: 'u', password: 'p', port: 6543 });
  });

  test('defaults de desarrollo', () => {
    const c = loadConfig({ NODE_ENV: 'development' });
    expect(c.db.host).toBe('localhost');
    expect(c.db.port).toBe(5432);
    expect(c.db.poolMax).toBe(5);
    expect(c.storage.backend).toBe('local');
    expect(c.urls.client).toBe('http://localhost:5173');
  });
});

describe('config/env — SSL', () => {
  test('DB_SSL=true → ssl on', () => {
    expect(loadConfig({ DB_SSL: 'true' }).db.ssl).toBe(true);
  });
  test('DB_SSL=false en producción → ssl off (override explícito)', () => {
    expect(loadConfig({ ...PROD_OK, DB_SSL: 'false' }).db.ssl).toBe(false);
  });
  test('producción sin DB_SSL → ssl on por defecto', () => {
    expect(loadConfig({ ...PROD_OK }).db.ssl).toBe(true);
  });
  test('sslmode=require en la URL activa ssl aunque no haya DB_SSL', () => {
    expect(loadConfig({ DATABASE_URL: 'postgres://u:p@h/db?sslmode=require' }).db.ssl).toBe(true);
  });
  test('PGSSLMODE=require activa ssl', () => {
    expect(loadConfig({ PGSSLMODE: 'require' }).db.ssl).toBe(true);
  });

  test('buildSequelizeOptions: ssl on → dialectOptions.ssl.require, rejectUnauthorized true', () => {
    const opts = buildSequelizeOptions(loadConfig({ DB_SSL: 'true' }));
    expect(opts.dialectOptions.ssl).toEqual({ require: true, rejectUnauthorized: true });
  });
  test('buildSequelizeOptions: DB_SSL_NO_VERIFY=true → rejectUnauthorized false', () => {
    const opts = buildSequelizeOptions(loadConfig({ DB_SSL: 'true', DB_SSL_NO_VERIFY: 'true' }));
    expect(opts.dialectOptions.ssl.rejectUnauthorized).toBe(false);
  });
  test('buildSequelizeOptions: ssl off → sin dialectOptions', () => {
    const opts = buildSequelizeOptions(loadConfig({ NODE_ENV: 'development' }));
    expect(opts.dialectOptions).toBeUndefined();
    expect(opts.pool.max).toBe(5);
  });
  test('DB_POOL_MAX configurable', () => {
    const opts = buildSequelizeOptions(loadConfig({ DB_POOL_MAX: '12' }));
    expect(opts.pool.max).toBe(12);
  });
});

describe('config/env — validación de producción', () => {
  test('config de prod completa → sin errores', () => {
    expect(validateConfig(loadConfig(PROD_OK))).toEqual([]);
  });

  test('producción sin JWT_SECRET → error (sin filtrar valores)', () => {
    const errs = validateConfig(loadConfig({ ...PROD_OK, JWT_SECRET: undefined }));
    expect(errs.some((e) => /JWT_SECRET/.test(e))).toBe(true);
  });

  test('JWT_SECRET corto en producción → error', () => {
    const errs = validateConfig(loadConfig({ ...PROD_OK, JWT_SECRET: 'corto' }));
    expect(errs.some((e) => /JWT_SECRET.*32/.test(e))).toBe(true);
  });

  test('producción con CLIENT_URL HTTP → error de HTTPS', () => {
    const errs = validateConfig(loadConfig({ ...PROD_OK, CLIENT_URL: 'http://app.com', ALLOWED_ORIGINS: 'https://app.com' }));
    expect(errs.some((e) => /CLIENT_URL.*HTTPS/i.test(e))).toBe(true);
  });

  test('producción con URL inválida → error', () => {
    const errs = validateConfig(loadConfig({ ...PROD_OK, CLIENT_URL: 'no-es-una-url', ALLOWED_ORIGINS: 'https://app.com' }));
    expect(errs.some((e) => /CLIENT_URL no es una URL/i.test(e))).toBe(true);
  });

  test('ALLOWED_ORIGINS con comodín "*" → error (credentials)', () => {
    const errs = validateConfig(loadConfig({ ...PROD_OK, ALLOWED_ORIGINS: '*' }));
    expect(errs.some((e) => /comod/i.test(e))).toBe(true);
  });

  test('producción sin config de DB → error', () => {
    const errs = validateConfig(loadConfig({ ...PROD_OK, DATABASE_URL: undefined }));
    expect(errs.some((e) => /DATABASE_URL/.test(e))).toBe(true);
  });

  test('EMAIL_PORT no numérico → error', () => {
    const errs = validateConfig(loadConfig({ ...PROD_OK, EMAIL_PORT: 'abc' }));
    expect(errs.some((e) => /EMAIL_PORT/.test(e))).toBe(true);
  });

  test('EMAIL_REQUIRED=true sin credenciales → error', () => {
    const errs = validateConfig(loadConfig({ ...PROD_OK, EMAIL_REQUIRED: 'true' }));
    expect(errs.some((e) => /EMAIL_REQUIRED/.test(e))).toBe(true);
  });
});

describe('config/env — normalización de URLs', () => {
  test('quita barras finales de CLIENT_URL / PUBLIC_URL / orígenes', () => {
    const c = loadConfig({
      CLIENT_URL: 'https://app.com/',
      PUBLIC_URL: 'https://api.com///',
      ALLOWED_ORIGINS: 'https://a.com/, https://b.com/ ',
    });
    expect(c.urls.client).toBe('https://app.com');
    expect(c.urls.public).toBe('https://api.com');
    expect(c.urls.allowedOrigins).toEqual(['https://a.com', 'https://b.com']);
  });

  test('ALLOWED_ORIGINS acepta múltiples separados por coma y deduplica', () => {
    const c = loadConfig({ ALLOWED_ORIGINS: 'https://a.com, https://b.com, https://a.com' });
    expect(c.urls.allowedOrigins).toEqual(['https://a.com', 'https://b.com']);
  });
});

describe('config/env — storage S3', () => {
  const S3_OK = {
    NODE_ENV: 'production',
    STORAGE_BACKEND: 's3',
    S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
    S3_BUCKET: 'priv',
    S3_PUBLIC_BUCKET: 'pub',
    S3_ACCESS_KEY_ID: 'k',
    S3_SECRET_ACCESS_KEY: 's',
    S3_PUBLIC_BASE_URL: 'https://cdn.example.com',
  };

  test('S3 completa → sin errores de storage', () => {
    const errs = validateConfig(loadConfig({ ...PROD_OK, ...S3_OK }));
    expect(errs.filter((e) => /S3_/.test(e))).toEqual([]);
  });

  test('STORAGE_BACKEND=s3 en producción sin S3_BUCKET → error', () => {
    const { S3_BUCKET, ...sinBucket } = S3_OK;
    const errs = validateConfig(loadConfig({ ...PROD_OK, ...sinBucket }));
    expect(errs.some((e) => /S3_BUCKET/.test(e))).toBe(true);
  });

  test('STORAGE_BACKEND desconocido → error', () => {
    const errs = validateConfig(loadConfig({ STORAGE_BACKEND: 'ftp' }));
    expect(errs.some((e) => /STORAGE_BACKEND/.test(e))).toBe(true);
  });

  test('keyPrefix se limpia de barras', () => {
    expect(loadConfig({ S3_KEY_PREFIX: '/pre/' }).storage.s3.keyPrefix).toBe('pre');
  });
});
