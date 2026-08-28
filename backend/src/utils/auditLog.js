'use strict';

/**
 * auditLog.js — OPS-01.
 *
 * Punto ÚNICO de escritura del log de auditoría (`activity_logs`).
 * Reemplaza las 7 copias locales de `logAction`.
 *
 * El log de auditoría es inmutable, para admins/compliance, y guarda PII por
 * diseño (email/nombre — hace falta para auditar) pero NUNCA secretos: cada
 * `detalle` pasa por `redactar()` antes de persistirse.
 *
 * Fallo silencioso: un problema al registrar auditoría nunca interrumpe el
 * flujo principal (sólo se avisa por el logger técnico).
 */

const { ActivityLog } = require('../models');
const logger = require('./logger');

const CLAVE_SENSIBLE = /pass|token|secret|authorization|cookie|\bhash\b|carta|\bcv\b/i;

/**
 * Scrub recursivo: reemplaza el VALOR de cualquier clave que parezca sensible.
 * Defensa a futuro: aunque un dev agregue un campo sensible al `detalle`.
 */
function redactar(valor, profundidad = 0) {
  if (profundidad > 4 || valor === null || typeof valor !== 'object') return valor;
  if (Array.isArray(valor)) return valor.map((v) => redactar(v, profundidad + 1));
  const out = {};
  for (const [k, v] of Object.entries(valor)) {
    out[k] = CLAVE_SENSIBLE.test(k) ? '[REDACTED]' : redactar(v, profundidad + 1);
  }
  return out;
}

/**
 * Registra un evento de auditoría.
 * @param {object} opts
 * @param {import('express').Request} [opts.req]  - si se pasa, deriva usuarioId/ip/requestId
 * @param {number} [opts.usuarioId]   - gana sobre req.usuario.id
 * @param {string} [opts.ip]          - gana sobre req.ip
 * @param {string} [opts.requestId]   - gana sobre req.id
 * @param {string} opts.accion        - valor del ENUM activity_logs.accion
 * @param {string} [opts.entidad]
 * @param {number} [opts.entidadId]
 * @param {object} [opts.detalle]
 */
async function registrarAuditoria({ req, usuarioId, ip, requestId, accion, entidad, entidadId, detalle }) {
  try {
    await ActivityLog.create({
      usuarioId: usuarioId ?? req?.usuario?.id ?? null,
      accion,
      entidad: entidad ?? null,
      entidadId: entidadId ?? null,
      detalle: detalle ? redactar(detalle) : null,
      ip: ip ?? req?.ip ?? null,
      requestId: requestId ?? req?.id ?? null,
    });
  } catch (e) {
    (req?.log || logger).warn({ err: e, accion }, 'auditoria_no_registrada');
  }
}

module.exports = { registrarAuditoria, redactar };
