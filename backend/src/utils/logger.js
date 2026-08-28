'use strict';

/**
 * logger.js — OPS-01.
 *
 * Logger técnico estructurado (pino). Emite JSON a stdout (12-factor); la
 * rotación/retención de ese stream es cosa de la plataforma (pm2/systemd/docker).
 *
 * NO confundir con el log de AUDITORÍA (`activity_logs` vía utils/auditLog.js):
 * ver la tabla comparativa en backend/README.md.
 *
 * Niveles: debug (dev, incluye SQL) · info (prod) · warn (degradaciones) ·
 *          error (excepciones no manejadas / 5xx) · fatal (arranque fallido).
 * Override con LOG_LEVEL. En tests: 'silent'.
 */

const pino = require('pino');

const nivel = process.env.LOG_LEVEL
  || (process.env.NODE_ENV === 'test' ? 'silent'
      : process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const usarPretty = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

const logger = pino({
  level: nivel,
  base: { service: 'pasantias-api' },
  // Redacción defensiva: ningún secreto llega al log técnico, a cualquier
  // profundidad. Cubre headers de auth/cookie y campos *password*/*token*/etc.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      '*.password', '*.passwordActual', '*.nuevaPassword', '*.passwordPlano', '*.passwordGenerada',
      '*.token', '*.tokenReset', '*.devToken', '*.hash', '*.hashSha256', '*.jwt', '*.secret', '*.csrf_token',
      'password', 'token', 'tokenReset', 'authorization',
    ],
    censor: '[REDACTED]',
  },
  ...(usarPretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,service' },
        },
      }
    : {}),
});

module.exports = logger;
