'use strict';

/**
 * archivoImagen.service.js — SEC-03 + DEPLOY-01.
 *
 * Subida endurecida de imágenes PÚBLICAS (foto de perfil, logo de empresa).
 * A diferencia de CV/carta (privados, servidos por GET /api/archivos/:id), las
 * imágenes van al almacenamiento "público" (local: backend/uploads/public/ ;
 * s3: bucket público) y se referencian por su URL pública absoluta.
 *
 * Flujo (multer usa memoryStorage — nada toca el disco sin validar):
 *   1. multer deja el archivo en memoria (req.file.buffer), límite 2 MB.
 *   2. Se verifican los magic bytes; si no coinciden → 400 (no se subió nada).
 *   3. Se sube el objeto al backend activo con una key ALEATORIA (UUID).
 *   4. Se registra la fila Archivo. Si falla → se borra el objeto recién subido
 *      y se propaga el error (consistencia: no queda un objeto sin metadata).
 *   5. Se borra la imagen anterior (objeto remoto + fila) — best-effort.
 */

const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');
const multer = require('multer');
const HttpError = require('../utils/httpError');
const { Archivo } = require('../models');
const storage = require('./storage');
const { UPLOADS_ROOT } = require('./storage/paths');
const { EXT_POR_MIME, firmaCoincide, sanitizarNombreOriginal } = require('../utils/archivoNombre');

// Solo relevante para el backend `local` (lo usan los tests).
const PUBLIC_DIR = path.join(UPLOADS_ROOT, 'public');
const MIMES_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];
const LIMITS = { fileSize: 2 * 1024 * 1024, files: 1, parts: 10, fields: 5 };

const multerImagen = multer({
  storage: multer.memoryStorage(),
  limits: LIMITS,
  fileFilter: (req, file, cb) => {
    if (MIMES_IMAGEN.includes(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, 'Solo se aceptan imágenes JPG, PNG o WEBP.'));
  },
});

/**
 * Borra la imagen pública anterior (objeto remoto + fila Archivo) — best-effort.
 * Se corre DESPUÉS de que la nueva imagen ya quedó registrada, así un fallo acá
 * no rompe la subida (solo deja un objeto huérfano; limitación documentada).
 */
async function rmArchivoAnterior(valorAnterior) {
  const key = storage.claveDesdeUrlPublica(valorAnterior);
  if (!key) return; // URL externa / legacy (i.pravatar.cc, etc.) → no se toca

  const row = await Archivo.findOne({ where: { claveAlmacenamiento: key } }).catch(() => null);
  const backend = row?.backend || (key.startsWith('/uploads/') ? 'local' : 's3');

  try {
    await storage.get(backend).deleteObject(key, { area: 'public' });
  } catch (err) {
    logger.warn({ err: { name: err.name, message: err.message } }, 'imagen_anterior_no_borrada');
  }
  if (row) {
    try { await row.destroy({ force: true }); } catch { /* nada */ }
  }
}

/**
 * Valida y sube la imagen recién recibida por multer.
 * @param {{ req, tipo: 'foto_perfil'|'logo_empresa', valorAnterior?: string }} opts
 * @returns {Promise<{ urlPublica: string, archivoId: string }>}
 */
async function procesarSubidaImagen({ req, tipo, valorAnterior }) {
  if (!req.file) throw new HttpError(400, 'No se subió ninguna imagen.');

  const buffer = req.file.buffer;
  if (!firmaCoincide(buffer, req.file.mimetype)) {
    throw new HttpError(400, 'El contenido del archivo no coincide con su tipo declarado.');
  }

  const ext = EXT_POR_MIME[req.file.mimetype] || '.bin';
  const key = storage.keyFor('public', { tipo, ext });

  await storage.primary.putObject({
    key,
    body: buffer,
    contentType: req.file.mimetype,
    cacheControl: 'public, max-age=3600',
    area: 'public',
  });

  // Fila Archivo AUTORITATIVA: si no se puede registrar, se revierte el objeto.
  let archivo;
  try {
    archivo = await Archivo.create({
      usuarioPropietarioId: req.usuario.id,
      tipo,
      nombreOriginal: sanitizarNombreOriginal(req.file.originalname, req.file.mimetype),
      claveAlmacenamiento: key,
      mimeType: req.file.mimetype,
      tamanioBytes: buffer.length,
      hashSha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      backend: storage.primaryName,
    });
  } catch (err) {
    await storage.primary.deleteObject(key, { area: 'public' }).catch((e) =>
      logger.warn({ err: { name: e.name, message: e.message } }, 'cleanup_imagen_tras_fallo_db'));
    throw err;
  }

  const urlPublica = storage.primary.publicUrl(key);

  // Recién ahora (nueva imagen ya persistida) se borra la anterior.
  await rmArchivoAnterior(valorAnterior);

  return { urlPublica, archivoId: archivo.id };
}

module.exports = { multerImagen, procesarSubidaImagen, rmArchivoAnterior, PUBLIC_DIR };
