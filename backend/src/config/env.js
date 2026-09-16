'use strict';

/**
 * env.js — Configuración centralizada y validada (DEPLOY-01).
 *
 * Único punto donde se leen las variables de entorno de la aplicación. El resto
 * del código consume `config` (objeto congelado) en vez de `process.env.*`
 * disperso. Excepción deliberada: `utils/cookies.js` sigue leyendo `process.env`
 * en cada llamada para que los tests que cambian `NODE_ENV`/`COOKIE_*` a mitad
 * de suite (tests/seguridad.test.js) sigan funcionando.
 *
 * Módulo PURO: no requiere nada de `src/` (evita ciclos). No imprime nunca el
 * valor de un secreto.
 *
 * - `loadConfig(raw)`   → arma el objeto config (con `.warnings`).
 * - `validateConfig(c)` → lista TODOS los errores (no corta en el primero).
 * - `validateEnv()`     → si NODE_ENV=production y hay errores, lanza. Devuelve
 *                         los warnings para que el caller los loguee.
 *
 * `validateEnv()` se llama SOLO desde `server.js` (nunca desde `app.js`), así
 * requerir `../src/app` en la suite de tests nunca lanza.
 */

// Carga backend/.env si existe (idempotente: no pisa variables ya definidas).
// Los tests (tests/setup/env.js) y server.js/scripts ya llaman dotenv antes;
// esto es la red de seguridad para cualquier require directo de este módulo.
require('dotenv').config();

const DEV_JWT_FALLBACK = 'dev-insecure-jwt-secret-change-me-please-0000000000';
const JWT_MIN_LEN = 32;

// ── helpers ──────────────────────────────────────────────────────────────────

function stripTrailingSlashes(u) {
  return String(u).trim().replace(/\/+$/, '');
}

/** Normaliza una URL: trim + saca barras finales. `undefined` si vacía. */
function normalizeUrl(u) {
  if (u == null || String(u).trim() === '') return undefined;
  return stripTrailingSlashes(u) || undefined;
}

function isValidUrl(u) {
  try {
    // eslint-disable-next-line no-new
    new URL(u);
    return true;
  } catch {
    return false;
  }
}

function isHttpsUrl(u) {
  try {
    return new URL(u).protocol === 'https:';
  } catch {
    return false;
  }
}

/** "a, b/ ,, b" → ["a","b"] (trim, sin barra final, sin vacíos, sin duplicados). */
function parseOrigins(raw) {
  if (!raw) return [];
  return [...new Set(
    String(raw)
      .split(',')
      .map((s) => stripTrailingSlashes(s))
      .filter(Boolean),
  )];
}

function toIntOrNull(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

/** TRUST_PROXY: '' → null (no setear) · 'true'/'false' · número · string tal cual. */
function resolveTrustProxy(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^\d+$/.test(s)) return Number(s);
  return s;
}

function deepFreeze(obj) {
  Object.getOwnPropertyNames(obj).forEach((k) => {
    const v = obj[k];
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  });
  return Object.freeze(obj);
}

// ── loadConfig ───────────────────────────────────────────────────────────────

function loadConfig(raw = process.env) {
  const warnings = [];
  const nodeEnv = raw.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  // JWT
  let jwtSecret = raw.JWT_SECRET && String(raw.JWT_SECRET).trim();
  if (!jwtSecret && !isProd) {
    jwtSecret = DEV_JWT_FALLBACK;
    warnings.push('JWT_SECRET no definido: usando un valor de desarrollo inseguro. No usar así en producción.');
  }

  const sameSite = (raw.COOKIE_SAMESITE || 'lax').toLowerCase();

  // Storage
  const storageBackend = (raw.STORAGE_BACKEND || 'local').toLowerCase();

  // DB SSL: DB_SSL explícito gana; si no, ON en prod o si la connection string /
  // PGSSLMODE piden require.
  let dbSsl;
  if (raw.DB_SSL === 'true') dbSsl = true;
  else if (raw.DB_SSL === 'false') dbSsl = false;
  else {
    const urlPideSsl = /[?&]sslmode=require\b/i.test(raw.DATABASE_URL || '');
    const pgSslMode = String(raw.PGSSLMODE || '').toLowerCase() === 'require';
    dbSsl = isProd || urlPideSsl || pgSslMode;
  }

  const emailUser = raw.EMAIL_USER || '';
  const emailPass = raw.EMAIL_PASS || '';

  const config = {
    nodeEnv,
    isProd,
    isTest,
    isDev: !isProd && !isTest,
    port: raw.PORT != null && String(raw.PORT).trim() !== '' ? Number(raw.PORT) : 5000,

    jwt: {
      secret: jwtSecret || '',
      expiresIn: raw.JWT_EXPIRES_IN || '7d',
    },

    urls: {
      client: normalizeUrl(raw.CLIENT_URL) || (isProd ? undefined : 'http://localhost:5173'),
      public: normalizeUrl(raw.PUBLIC_URL) || (isProd ? undefined : 'http://localhost:5000'),
      allowedOrigins: (() => {
        const parsed = parseOrigins(raw.ALLOWED_ORIGINS || raw.CLIENT_URL);
        return parsed.length ? parsed : (isProd ? [] : ['http://localhost:5173']);
      })(),
    },

    db: {
      url: raw.DATABASE_URL || undefined,
      host: raw.DB_HOST || (isProd ? undefined : 'localhost'),
      port: raw.DB_PORT != null && String(raw.DB_PORT).trim() !== '' ? Number(raw.DB_PORT) : 5432,
      name: raw.DB_NAME || undefined,
      user: raw.DB_USER || undefined,
      password: raw.DB_PASSWORD != null ? raw.DB_PASSWORD : undefined,
      ssl: dbSsl,
      sslNoVerify: raw.DB_SSL_NO_VERIFY === 'true',
      poolMax: raw.DB_POOL_MAX != null && String(raw.DB_POOL_MAX).trim() !== '' ? Number(raw.DB_POOL_MAX) : 5,
    },

    cookie: {
      sameSite,
      secure: raw.COOKIE_SECURE === 'false' ? false : (isProd || sameSite === 'none'),
      domain: raw.COOKIE_DOMAIN || undefined,
    },

    trustProxy: resolveTrustProxy(raw.TRUST_PROXY),

    storage: {
      backend: storageBackend,
      s3: {
        endpoint: raw.S3_ENDPOINT || undefined,
        region: raw.S3_REGION || 'auto',
        bucket: raw.S3_BUCKET || undefined,
        publicBucket: raw.S3_PUBLIC_BUCKET || undefined,
        accessKeyId: raw.S3_ACCESS_KEY_ID || undefined,
        secretAccessKey: raw.S3_SECRET_ACCESS_KEY || undefined,
        forcePathStyle: raw.S3_FORCE_PATH_STYLE === 'true',
        publicBaseUrl: normalizeUrl(raw.S3_PUBLIC_BASE_URL),
        keyPrefix: (raw.S3_KEY_PREFIX || 'sispasantias').replace(/^\/+|\/+$/g, ''),
      },
    },

    email: {
      host: raw.EMAIL_HOST || 'smtp.gmail.com',
      port: raw.EMAIL_PORT != null && String(raw.EMAIL_PORT).trim() !== '' ? Number(raw.EMAIL_PORT) : 587,
      secure: raw.EMAIL_SECURE === 'true',
      user: emailUser,
      pass: emailPass,
      from: raw.EMAIL_FROM || (emailUser ? `"SisPasantías" <${emailUser}>` : ''),
      required: raw.EMAIL_REQUIRED === 'true',
      configured: Boolean(emailUser && emailPass),
    },

    logLevel: raw.LOG_LEVEL || undefined,

    enableApiDocs: raw.ENABLE_API_DOCS === 'true'
      ? true
      : raw.ENABLE_API_DOCS === 'false'
        ? false
        : !isProd,

    seed: {
      presentacionOnBoot: raw.SEED_PRESENTACION_ON_BOOT
        ? raw.SEED_PRESENTACION_ON_BOOT === 'true'
        : nodeEnv === 'development',
      allowProductionDemoSeed: raw.ALLOW_PRODUCTION_DEMO_SEED === 'true',
    },

    csvImport: {
      maxBytes: raw.CSV_IMPORT_MAX_BYTES != null && String(raw.CSV_IMPORT_MAX_BYTES).trim() !== ''
        ? Number(raw.CSV_IMPORT_MAX_BYTES) : 2 * 1024 * 1024,
      maxRows: raw.CSV_IMPORT_MAX_ROWS != null && String(raw.CSV_IMPORT_MAX_ROWS).trim() !== ''
        ? Number(raw.CSV_IMPORT_MAX_ROWS) : 2000,
    },

    warnings,
    // guardado sin normalizar solo para mensajes de error legibles
    _raw: {
      CLIENT_URL: raw.CLIENT_URL,
      PUBLIC_URL: raw.PUBLIC_URL,
      ALLOWED_ORIGINS: raw.ALLOWED_ORIGINS,
      DB_POOL_MAX: raw.DB_POOL_MAX,
      DB_PORT: raw.DB_PORT,
      PORT: raw.PORT,
      EMAIL_PORT: raw.EMAIL_PORT,
      JWT_SECRET_SET: Boolean(raw.JWT_SECRET),
      S3_PUBLIC_BASE_URL: raw.S3_PUBLIC_BASE_URL,
    },
  };

  return deepFreeze(config);
}

// ── validateConfig ───────────────────────────────────────────────────────────

function validateConfig(c) {
  const errors = [];
  const req = (val, name) => {
    if (val == null || String(val).trim() === '') errors.push(`${name} es obligatorio en producción.`);
  };
  const checkUrl = (val, name, { httpsInProd }) => {
    if (val == null) return;
    if (!isValidUrl(val)) { errors.push(`${name} no es una URL válida.`); return; }
    if (httpsInProd && c.isProd && !isHttpsUrl(val)) errors.push(`${name} debe usar HTTPS en producción.`);
  };

  // ── siempre (cualquier entorno) ──
  if (c._raw.PORT != null && String(c._raw.PORT).trim() !== ''
    && (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535)) {
    errors.push('PORT debe ser un entero entre 1 y 65535.');
  }
  if (!Number.isInteger(c.db.poolMax) || c.db.poolMax < 1) {
    errors.push('DB_POOL_MAX debe ser un entero >= 1.');
  }
  if (c._raw.DB_PORT != null && String(c._raw.DB_PORT).trim() !== ''
    && (!Number.isInteger(c.db.port) || c.db.port < 1 || c.db.port > 65535)) {
    errors.push('DB_PORT debe ser un entero entre 1 y 65535.');
  }
  {
    const p = toIntOrNull(c._raw.EMAIL_PORT);
    if (Number.isNaN(p) || (p != null && (p < 1 || p > 65535))) {
      errors.push('EMAIL_PORT debe ser un entero entre 1 y 65535.');
    }
  }
  if (c.email.required && !c.email.configured) {
    errors.push('EMAIL_REQUIRED=true pero faltan EMAIL_USER y/o EMAIL_PASS.');
  }
  if (!Number.isInteger(c.csvImport.maxBytes) || c.csvImport.maxBytes < 1) {
    errors.push('CSV_IMPORT_MAX_BYTES debe ser un entero >= 1.');
  }
  if (!Number.isInteger(c.csvImport.maxRows) || c.csvImport.maxRows < 1) {
    errors.push('CSV_IMPORT_MAX_ROWS debe ser un entero >= 1.');
  }

  // ALLOWED_ORIGINS: nunca comodín con credentials
  if (c.urls.allowedOrigins.includes('*')) {
    errors.push('ALLOWED_ORIGINS no admite el comodín "*" (las cookies viajan con credentials).');
  }
  c.urls.allowedOrigins.forEach((o) => {
    if (o !== '*' && !isValidUrl(o)) errors.push(`ALLOWED_ORIGINS contiene un origen inválido: "${o}".`);
    if (o !== '*' && isValidUrl(o) && c.isProd && !isHttpsUrl(o)) {
      errors.push(`ALLOWED_ORIGINS: "${o}" debe usar HTTPS en producción.`);
    }
  });

  // Storage S3: si el backend es s3, la config de S3 es obligatoria (cualquier entorno)
  if (c.storage.backend === 's3') {
    req(c.storage.s3.endpoint, 'S3_ENDPOINT');
    req(c.storage.s3.bucket, 'S3_BUCKET');
    req(c.storage.s3.publicBucket, 'S3_PUBLIC_BUCKET');
    req(c.storage.s3.accessKeyId, 'S3_ACCESS_KEY_ID');
    req(c.storage.s3.secretAccessKey, 'S3_SECRET_ACCESS_KEY');
    req(c.storage.s3.publicBaseUrl, 'S3_PUBLIC_BASE_URL');
    if (c.storage.s3.publicBaseUrl && !isValidUrl(c.storage.s3.publicBaseUrl)) {
      errors.push('S3_PUBLIC_BASE_URL no es una URL válida.');
    }
  } else if (c.storage.backend !== 'local') {
    errors.push(`STORAGE_BACKEND debe ser "local" o "s3" (recibido: "${c.storage.backend}").`);
  }

  // ── validaciones de producción ──
  if (c.isProd) {
    if (!c.jwt.secret) errors.push('JWT_SECRET es obligatorio en producción.');
    else if (c.jwt.secret.length < JWT_MIN_LEN) {
      errors.push(`JWT_SECRET debe tener al menos ${JWT_MIN_LEN} caracteres.`);
    }

    req(c._raw.CLIENT_URL, 'CLIENT_URL');
    checkUrl(c.urls.client, 'CLIENT_URL', { httpsInProd: true });

    if (!c.urls.allowedOrigins.length) errors.push('ALLOWED_ORIGINS es obligatorio en producción.');

    if (c.storage.backend === 'local') {
      req(c._raw.PUBLIC_URL, 'PUBLIC_URL');
      checkUrl(c.urls.public, 'PUBLIC_URL', { httpsInProd: true });
    } else if (c.urls.public) {
      checkUrl(c.urls.public, 'PUBLIC_URL', { httpsInProd: true });
    }

    const tieneDbUrl = Boolean(c.db.url);
    const tieneDbSueltas = Boolean(c.db.name && c.db.user && c.db.password != null && c.db.host);
    if (!tieneDbUrl && !tieneDbSueltas) {
      errors.push('Configurá DATABASE_URL, o DB_HOST + DB_NAME + DB_USER + DB_PASSWORD.');
    }
  }

  return errors;
}

// ── singleton + validateEnv ──────────────────────────────────────────────────

const config = loadConfig();

function validateEnv() {
  const errors = validateConfig(config);
  if (config.isProd && errors.length) {
    throw new Error(
      `Configuración de entorno inválida para producción:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }
  return config.warnings;
}

module.exports = {
  config,
  loadConfig,
  validateConfig,
  validateEnv,
  // exportados para tests
  normalizeUrl,
  parseOrigins,
  resolveTrustProxy,
};
