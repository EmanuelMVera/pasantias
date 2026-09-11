'use strict';

/**
 * storage/local.adapter.js — Backend de almacenamiento en filesystem.
 *
 * Para desarrollo y tests. Conserva el comportamiento previo a DEPLOY-01: los
 * archivos privados viven en `backend/uploads/`, los públicos en
 * `backend/uploads/public/` (servidos por el `express.static` de app.js).
 *
 * Las "claves" son las mismas rutas relativas que ya guardaba la DB:
 *   privado  → `/uploads/<archivo>`
 *   público  → `/uploads/public/<archivo>`
 */

const fs = require('fs');
const path = require('path');
const { config } = require('../../config/env');
const { resolverRutaAbsoluta, resolverRutaSegura } = require('./paths');

const name = 'local';

async function putObject({ key, body }) {
  const absoluta = resolverRutaAbsoluta(key);
  fs.mkdirSync(path.dirname(absoluta), { recursive: true });
  fs.writeFileSync(absoluta, body);
  return { key };
}

async function getObjectStream(key) {
  const absoluta = resolverRutaSegura(key); // lanza 404 si no existe
  return { stream: fs.createReadStream(absoluta) };
}

async function deleteObject(key) {
  // Borrado idempotente: no exige que exista (guard de traversal igual).
  const absoluta = resolverRutaAbsoluta(key);
  fs.rmSync(absoluta, { force: true });
}

async function objectExists(key) {
  try {
    return fs.existsSync(resolverRutaAbsoluta(key));
  } catch {
    return false;
  }
}

/** URL pública servida por el propio backend (`/uploads/public/...`). */
function publicUrl(key) {
  const base = (config.urls.public || '').replace(/\/+$/, '');
  return `${base}${key.startsWith('/') ? '' : '/'}${key}`;
}

module.exports = { name, putObject, getObjectStream, deleteObject, objectExists, publicUrl };
