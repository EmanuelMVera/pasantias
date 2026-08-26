/**
 * app.js — Configuración central de la aplicación Express.
 *
 * Aquí se configuran:
 * - Los middlewares globales (CORS, parseo de JSON, archivos estáticos)
 * - Las rutas de la API REST
 * - El endpoint de health check
 * - El manejador global de errores
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Asegura que existan las carpetas de uploads antes de montar el estático o
// de que multer intente escribir en ellas (en un clone nuevo no existen,
// están gitignoreadas a propósito porque son datos de usuarios, no código).
fs.mkdirSync(path.join(__dirname, '../uploads/public'), { recursive: true });

const errorMiddleware = require('./middleware/error.middleware');

const app = express();

// ── Configuración de CORS ─────────────────────────────────────────────────────
// Lista de orígenes permitidos para hacer requests al backend
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
];

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (ej: Postman, curl, herramientas de testing)
    if (!origin) return callback(null, true);
    // Permitir orígenes locales y subdominios de Cloudflare Tunnel (para exposición pública)
    if (
      allowedOrigins.includes(origin) ||
      /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin)
    ) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origen no permitido → ${origin}`));
    }
  },
  credentials: true, // Permite el envío de cookies y headers de autorización
}));

// Permite que el servidor lea el cuerpo de las requests en formato JSON
app.use(express.json());
// Permite leer datos de formularios HTML tradicionales (application/x-www-form-urlencoded)
app.use(express.urlencoded({ extended: true }));

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
