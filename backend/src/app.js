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
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Asegura que existan las carpetas de uploads antes de montar el estático o
// de que multer intente escribir en ellas (en un clone nuevo no existen,
// están gitignoreadas a propósito porque son datos de usuarios, no código).
fs.mkdirSync(path.join(__dirname, '../uploads/public'), { recursive: true });

const errorMiddleware = require('./middleware/error.middleware');
const csrfProtection = require('./middleware/csrf');
const { apiLimiter } = require('./middleware/rateLimit');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// ── trust proxy (SEC-02) ──────────────────────────────────────────────────────
// Necesario detrás de un reverse proxy / Cloudflare Tunnel para que `req.ip`
// (y por lo tanto el rate limiting y ActivityLog.ip) tomen la IP real del
// cliente del header X-Forwarded-For. NO setear si el backend recibe tráfico
// directo — permitiría spoofear la IP.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
}

// ── Security headers (SEC-02) ─────────────────────────────────────────────────
app.use(helmet({
  // API JSON: nada se renderiza como documento → CSP mínima (sin defaults de helmet).
  contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  // El frontend (otro origin) tiene que poder cargar /uploads/public (avatares/logos).
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'no-referrer' },
}));

// ── CORS (SEC-02) ─────────────────────────────────────────────────────────────
const allowlist = (process.env.ALLOWED_ORIGINS || process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',').map((s) => s.trim()).filter(Boolean);
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

// Archivos PÚBLICOS (avatares/logos si en el futuro se suben localmente —
// hoy casi siempre son URLs externas). SEC-01: este mount apunta solo a la
// subcarpeta `public/`, nunca a la raíz de `uploads/` completa — los CV y
// cartas de recomendación viven fuera de acá y solo se sirven autenticados
// vía GET /api/archivos/:id (ver archivo.routes.js).
app.use('/uploads', express.static(path.join(__dirname, '../uploads/public')));

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

// ── Manejador global de errores ───────────────────────────────────────────────
app.use(errorMiddleware);

module.exports = app;
