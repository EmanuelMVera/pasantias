/**
 * app.js — Configuración central de la aplicación Express.
 *
 * Aquí se configuran:
 * - Hardening HTTP (helmet, rate limiting, CORS, CSRF, límites de body) — SEC-02
 * - El parseo de JSON y los archivos estáticos
 * - Las rutas de la API REST
 * - El endpoint de health check
 * - El manejador global de errores
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const pinoHttp = require('pino-http');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { config } = require('./config/env');
const logger = require('./utils/logger');

// Asegura que existan las carpetas de uploads antes de montar el estático o
// de que multer intente escribir en ellas (en un clone nuevo no existen,
// están gitignoreadas a propósito porque son datos de usuarios, no código).
fs.mkdirSync(path.join(__dirname, '../uploads/public'), { recursive: true });

const errorMiddleware = require('./middleware/error.middleware');
const csrfProtection = require('./middleware/csrf');
const { apiLimiter } = require('./middleware/rateLimit');

const app = express();
const isProd = config.isProd;

// ── Chequeos de config de cookies en producción (SEC-02) ──────────────────────
// Con el proxy same-origin de Vercel (/api/* → Render) la cookie es first-party
// y SameSite=Lax es lo correcto. Los footguns reales en prod son: cookie de
// sesión sin Secure, o SameSite=None sin Secure (el navegador la descarta).
if (isProd) {
  if (!config.cookie.secure) {
    logger.warn('COOKIE_SECURE=false en producción: la cookie de sesión viajará sin el flag Secure.');
  }
  if (config.cookie.sameSite === 'none' && !config.cookie.secure) {
    logger.warn('COOKIE_SAMESITE=none sin Secure: el navegador va a descartar la cookie de sesión.');
  }
}

// ── trust proxy (SEC-02 / DEPLOY-01) ──────────────────────────────────────────
// Necesario detrás de un reverse proxy (Render, Cloudflare Tunnel, nginx) para
// que `req.ip` — y con él el rate limiting y ActivityLog.ip — y `req.protocol`
// tomen los valores reales de X-Forwarded-*. En Render: TRUST_PROXY=1.
// NO setear si el backend recibe tráfico directo (permitiría spoofear la IP).
if (config.trustProxy != null) {
  app.set('trust proxy', config.trustProxy);
}

// ── Logging técnico + request id (OPS-01) ─────────────────────────────────────
// Va PRIMERO: así todo request (incluidos 429, CORS rechazado, estáticos) tiene
// `req.id`, queda logeado, y devuelve el header X-Request-Id.
app.use(pinoHttp({
  logger,
  genReqId: (req, res) => {
    const entrante = req.headers['x-request-id'];
    const id = (typeof entrante === 'string' && /^[\w-]{8,64}$/.test(entrante))
      ? entrante
      : crypto.randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  autoLogging: { ignore: (req) => req.url === '/api/health' },
  customLogLevel: (req, res, err) =>
    (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
  customSuccessMessage: (req, res) => `${req.method} ${req.url} → ${res.statusCode}`,
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
}));

// ── Security headers (SEC-02) ─────────────────────────────────────────────────
app.use(helmet({
  // API JSON: nada se renderiza como documento → CSP mínima (sin defaults de helmet).
  contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  // El frontend (otro origin) tiene que poder cargar /uploads/public (avatares/logos).
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'no-referrer' },
}));

// ── CORS (SEC-02 / DEPLOY-01) ─────────────────────────────────────────────────
// allowlist ya viene normalizada (sin barra final, sin duplicados) y validada
// (URLs, HTTPS en prod, sin comodín) desde config/env.js. Con el proxy de Vercel
// el navegador ve la API como same-origin y no manda `Origin`; CORS acá cubre el
// dev local directo, herramientas server-to-server y un eventual dominio propio.
const allowlist = config.urls.allowedOrigins;
// Túneles trycloudflare: solo fuera de producción y con opt-in explícito.
const allowTunnels = process.env.ALLOW_TUNNEL_ORIGINS === 'true' && !isProd;

app.use(cors({
  origin: (origin, callback) => {
    // Requests sin origin (curl, Postman, health checks, same-origin server-side).
    if (!origin) return callback(null, true);
    if (allowlist.includes(origin)) return callback(null, true);
    if (allowTunnels && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin)) return callback(null, true);
    // Origen no permitido: se responde SIN cabeceras CORS (el navegador bloquea
    // la respuesta). No se lanza error → nada de 500 ni stack en los logs.
    return callback(null, false);
  },
  credentials: true, // necesario para la cookie de sesión (SEC-02)
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));

// ── Body parsing (SEC-02) ─────────────────────────────────────────────────────
// Solo JSON. `express.urlencoded` se removió: ningún endpoint lo usa y su
// ausencia impide que un <form> cross-site forje un POST (refuerzo CSRF).
app.use(express.json({ limit: '100kb' }));

// ── Rate limiting global + CSRF (SEC-02) ──────────────────────────────────────
app.use('/api', apiLimiter);
app.use(csrfProtection);

// Archivos PÚBLICOS locales (avatares y logos con STORAGE_BACKEND=local, y URLs
// locales legacy). El mount `/uploads/public` → carpeta `uploads/public/` — así
// la URL guardada coincide con la ruta servida. Con STORAGE_BACKEND=s3 las
// imágenes salen de S3_PUBLIC_BASE_URL y esta carpeta queda vacía (inofensivo).
// Los CV y cartas NO se sirven acá — solo autenticados vía GET /api/archivos/:id.
// SEC-03: sin listado de directorio, sin dotfiles; helmet ya aplica nosniff +
// CSP `default-src 'none'` + CORP cross-origin a estas respuestas.
app.use('/uploads/public', express.static(path.join(__dirname, '../uploads/public'), {
  dotfiles: 'deny',
  index: false,
  redirect: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=3600'),
}));

// ── Documentación OpenAPI (DOC-02) ────────────────────────────────────────────
// GET /api/docs (Swagger UI) + GET /api/openapi.json. Apagado en producción
// salvo ENABLE_API_DOCS=true. El mount usa su propio CSP (el helmet global
// bloquea el JS/CSS inline de Swagger UI).
require('./docs/serve')(app);

// ── Rutas de la API ───────────────────────────────────────────────────────────
// Cada ruta agrupa los endpoints relacionados a una funcionalidad del sistema
app.use('/api/auth',          require('./routes/auth.routes'));         // Autenticación y registro
app.use('/api/users',         require('./routes/user.routes'));         // Perfil y CV del usuario
app.use('/api/students',      require('./routes/student.routes'));      // Panel del alumno (dashboard, recomendadas)
app.use('/api/chat',          require('./routes/chat.routes'));         // Mensajería directa entre usuarios
app.use('/api/empresas',      require('./routes/empresa.routes'));      // Perfil y panel corporativo de empresa
app.use('/api/ofertas',       require('./routes/oferta.routes'));       // Publicaciones de pasantías
app.use('/api/postulaciones', require('./routes/postulacion.routes')); // Postulaciones de alumnos
app.use('/api/admin',         require('./routes/admin.routes'));        // Panel de administración
app.use('/api/notificaciones',    require('./routes/notificacion.routes'));     // Notificaciones del sistema
app.use('/api/solicitudes-empresa', require('./routes/solicitudEmpresa.routes')); // v1.5 — Solicitudes de registro de empresa
app.use('/api/archivos',      require('./routes/archivo.routes'));       // SEC-01 — CV/cartas privados, autenticado

// ── Health Check ──────────────────────────────────────────────────────────────
// Endpoint simple para verificar que el servidor está activo (útil para monitoreo)
app.get('/api/health', (req, res) => res.json({ status: 'OK', timestamp: new Date() }));

// ── 404 de la API ─────────────────────────────────────────────────────────────
// Cualquier /api/* que no matcheó ninguna ruta: respuesta JSON con la misma
// forma que el resto de los errores (sin esto, Express contesta su HTML por defecto).
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Recurso no encontrado.' });
});

// ── Manejador global de errores ───────────────────────────────────────────────
app.use(errorMiddleware);

module.exports = app;
