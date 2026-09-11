'use strict';

/**
 * storage/index.js — Fachada del almacenamiento (DEPLOY-01).
 *
 * - `primary` / `primaryName`: adapter del backend activo (`STORAGE_BACKEND`),
 *   para TODA escritura nueva.
 * - `get(backend)`: adapter para un backend puntual — se usa al leer/borrar
 *   según `Archivo.backend`, así una fila `local` vieja se sigue sirviendo del
 *   disco aunque el server ahora sea `s3` (compatibilidad obligatoria).
 * - `keyFor(area, {tipo, ext})`: clave/objeto ALEATORIA (UUID). Nunca usa el
 *   nombre del archivo ni ningún input del usuario.
 * - `claveDesdeUrlPublica(url)`: dada una URL pública guardada en la DB,
 *   devuelve su clave de almacenamiento (para poder borrar el objeto al
 *   reemplazar la imagen). `null` si es una URL externa/legacy.
 *
 * `primaryName` se lee de `process.env` en tiempo de llamada (no del config
 * congelado) para que los tests puedan forzar `STORAGE_BACKEND` por caso.
 */

const crypto = require('crypto');
const path = require('path');
const { config } = require('../../config/env');

const PREFIJO_POR_TIPO = {
  cv: 'cv',
  carta_recomendacion: 'carta',
  foto_perfil: 'foto',
  logo_empresa: 'logo',
  certificacion: 'cert',
  adjunto_mensaje: 'adj',
};

const _adapters = {};

function get(backend) {
  const key = String(backend || 'local').toLowerCase();
  if (_adapters[key]) return _adapters[key];
  if (key === 'local') _adapters[key] = require('./local.adapter');
  else if (key === 's3') _adapters[key] = require('./s3.adapter');
  else throw new Error(`Backend de almacenamiento desconocido: "${key}"`);
  return _adapters[key];
}

function primaryName() {
  return String(process.env.STORAGE_BACKEND || 'local').toLowerCase();
}

function safeExt(ext) {
  return /^\.[a-z0-9]{1,8}$/i.test(String(ext || '')) ? String(ext).toLowerCase() : '.bin';
}

function keyFor(area, { tipo, ext }) {
  const prefijo = PREFIJO_POR_TIPO[tipo] || 'archivo';
  const uuid = crypto.randomUUID();
  const e = safeExt(ext);

  if (primaryName() === 's3') {
    const tipoDir = String(tipo || 'archivo').replace(/[^a-z_]/gi, '') || 'archivo';
    const prefix = config.storage.s3.keyPrefix ? `${config.storage.s3.keyPrefix}/` : '';
    return `${prefix}${tipoDir}/${uuid}${e}`;
  }

  // local: mismo esquema de rutas que la DB ya guardaba
  return area === 'public'
    ? `/uploads/public/${prefijo}_${uuid}${e}`
    : `/uploads/${prefijo}_${uuid}${e}`;
}

function claveDesdeUrlPublica(url) {
  if (!url || typeof url !== 'string') return null;
  const u = url.split('?')[0];

  if (u.includes('/uploads/public/')) {
    const base = path.basename(u);
    return base && !base.includes('..') ? `/uploads/public/${base}` : null;
  }

  const s3Base = config.storage.s3.publicBaseUrl;
  if (s3Base && u.startsWith(s3Base.replace(/\/+$/, ''))) {
    return u.slice(s3Base.replace(/\/+$/, '').length).replace(/^\/+/, '') || null;
  }

  return null; // URL externa / legacy (i.pravatar.cc, etc.) → no se toca
}

module.exports = {
  get,
  keyFor,
  claveDesdeUrlPublica,
  get primaryName() { return primaryName(); },
  get primary() { return get(primaryName()); },
};
