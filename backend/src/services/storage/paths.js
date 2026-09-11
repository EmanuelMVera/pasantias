'use strict';

/**
 * storage/paths.js — Rutas del backend de almacenamiento `local` y guard contra
 * path traversal. Vivía en `archivo.service.js`; se movió acá para que el
 * `local.adapter` lo use sin ciclo (archivo.service ↔ storage). `archivo.service`
 * lo re-exporta para no romper importadores.
 */

const path = require('path');
const fs = require('fs');
const HttpError = require('../../utils/httpError');

// backend/src/services/storage → backend/uploads
const UPLOADS_ROOT = path.join(__dirname, '../../../uploads');

/**
 * Ruta absoluta en disco a partir de `claveAlmacenamiento`, garantizando que
 * quede dentro de UPLOADS_ROOT (la clave viene de la DB, no se confía en que
 * siempre sea benigna). NO chequea existencia.
 */
function resolverRutaAbsoluta(claveAlmacenamiento) {
  const relativa = String(claveAlmacenamiento).replace(/^\/?uploads\/?/, '');
  const absoluta = path.normalize(path.join(UPLOADS_ROOT, relativa));
  if (!absoluta.startsWith(UPLOADS_ROOT + path.sep) && absoluta !== UPLOADS_ROOT) {
    throw new HttpError(400, 'Ruta de archivo inválida.');
  }
  return absoluta;
}

/** Igual que `resolverRutaAbsoluta` pero además exige que el archivo exista. */
function resolverRutaSegura(claveAlmacenamiento) {
  const absoluta = resolverRutaAbsoluta(claveAlmacenamiento);
  if (!fs.existsSync(absoluta)) {
    throw new HttpError(404, 'El archivo ya no existe en el servidor.');
  }
  return absoluta;
}

module.exports = { UPLOADS_ROOT, resolverRutaAbsoluta, resolverRutaSegura };
