'use strict';

/**
 * rateLimit.js — SEC-02.
 *
 * Limiters específicos por riesgo (express-rate-limit, store en memoria — es
 * suficiente para una instancia única; migrar a un store compartido si se
 * escala horizontalmente).
 *
 * Todos:
 *  - respetan `trust proxy` (usan `req.ip`, seteado en app.js según TRUST_PROXY);
 *  - se saltan por completo en `NODE_ENV=test` (la suite hace muchos logins);
 *  - responden JSON `{ success:false, message, code:'RATE_LIMITED' }` con 429.
 */

const { rateLimit } = require('express-rate-limit');

// En la suite se saltean (los tests hacen muchos logins), salvo el archivo
// seguridad.test.js que setea SEC_TESTS=1 para ejercitarlos explícitamente.
const esTest = () => process.env.NODE_ENV === 'test' && process.env.SEC_TESTS !== '1';

function crearLimiter({ windowMs, max, keyGenerator, skipSuccessfulRequests = false, message }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests,
    skip: esTest,
    keyGenerator,
    // Los checks de arranque de express-rate-limit son ayudas de dev, no
    // seguridad en runtime; se desactivan para no ensuciar los logs (el
    // keyGenerator propio usa req.ip, que ya respeta `trust proxy`).
    validate: false,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        message: message || 'Demasiadas solicitudes. Esperá un momento e intentá de nuevo.',
      });
    },
  });
}

// Clave IP + email (para no castigar a toda una NAT por un ataque dirigido).
const keyIpEmail = (req) => `${req.ip}:${String(req.body?.email || '').trim().toLowerCase()}`;
const keyUsuario = (req) => (req.usuario?.id ? `u${req.usuario.id}` : req.ip);

// Login: 10 intentos FALLIDOS / 15 min por IP+email.
const authLimiter = crearLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: keyIpEmail,
  skipSuccessfulRequests: true,
  message: 'Demasiados intentos de inicio de sesión. Probá de nuevo en unos minutos.',
});

// Login: techo por IP (independiente del email) para frenar el credential
// stuffing que rota la cuenta en cada intento y así evade `authLimiter`.
// Cuenta TODOS los requests (también los exitosos) — 40 / 15 min es holgado
// para un uso legítimo desde una misma IP/NAT.
const authIpLimiter = crearLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_IP_RATE_MAX) || 40,
  keyGenerator: (req) => req.ip,
  message: 'Demasiados intentos de inicio de sesión desde esta conexión. Probá más tarde.',
});

// forgot/reset password: 5 / hora por IP (email-bombing + brute-force de token).
const passwordResetLimiter = crearLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.ip,
  message: 'Demasiadas solicitudes de recuperación. Probá de nuevo más tarde.',
});

// Solicitud pública de empresa: 5 / hora por IP.
const publicWriteLimiter = crearLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.ip,
  message: 'Ya enviaste varias solicitudes. Esperá antes de enviar otra.',
});

// Upload de CV/carta: 20 / hora por usuario.
const uploadLimiter = crearLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: keyUsuario,
  message: 'Demasiadas subidas de archivos. Esperá un rato.',
});

// Escrituras autenticadas de alta frecuencia (chat, postulaciones): 60 / min por usuario.
const writeLimiter = crearLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: keyUsuario,
  message: 'Estás enviando datos demasiado rápido. Esperá unos segundos.',
});

// Exportación de logs/estadísticas (PDF/Excel/CSV) del panel admin: generar
// un PDF/XLSX de miles de filas tiene un costo real de CPU/memoria — 20/hora
// por usuario es holgado para uso legítimo y frena un loop accidental o
// abusivo del botón de exportar.
const exportLimiter = crearLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: keyUsuario,
  message: 'Demasiadas exportaciones. Esperá un rato antes de generar otra.',
});

// Techo global de la API por IP (nunca debería dispararse en uso normal).
const apiLimiter = crearLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.API_RATE_MAX) || 1000,
  keyGenerator: (req) => req.ip,
  message: 'Demasiadas solicitudes desde esta conexión.',
});

module.exports = {
  authLimiter,
  authIpLimiter,
  passwordResetLimiter,
  publicWriteLimiter,
  uploadLimiter,
  writeLimiter,
  apiLimiter,
  exportLimiter,
};
