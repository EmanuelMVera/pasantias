'use strict';

/**
 * archivoImagen.service.js — SEC-03.
 *
 * Subida endurecida de imágenes PÚBLICAS (foto de perfil, logo de empresa).
 * A diferencia de CV/carta (privados, servidos por GET /api/archivos/:id), las
 * imágenes van a backend/uploads/public/ y las sirve el express.static de app.js.
 *
 * Flujo (evita que un archivo malicioso quede aunque sea un instante en public/):
 *   1. multer escribe a backend/uploads/ (privado), con nombre 100% server-side.
 *   2. procesarSubidaImagen() verifica magic bytes; si no coinciden → borra + 400.
 *   3. Si OK → mueve a backend/uploads/public/.
 *   4. Borra el archivo anterior (si era local) + su fila Archivo.
 *   5. Registra la nueva fila Archivo (best-effort) y devuelve la URL absoluta.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');
const multer = require('multer');
const HttpError = require('../utils/httpError');
const { Archivo } = require('../models');
const { UPLOADS_ROOT } = require('./archivo.service');
const { EXT_POR_MIME, firmaCoincide, sanitizarNombreOriginal } = require('../utils/archivoNombre');

const PUBLIC_DIR = path.join(UPLOADS_ROOT, 'public');
const MIMES_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];
const LIMITS = { fileSize: 2 * 1024 * 1024, files: 1, parts: 10, fields: 5 };

// prefijo del nombre según el campo del formulario ('foto' | 'logo').
const prefijoPorCampo = (fieldname) => (fieldname === 'logo' ? 'logo' : 'foto');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_ROOT), // privado; se publica tras validar
  filename: (req, file, cb) => {
    const ext = EXT_POR_MIME[file.mimetype] || '.bin';
    cb(null, `${prefijoPorCampo(file.fieldname)}_${req.usuario.id}_${Date.now()}${ext}`);
  },
});

const multerImagen = multer({
  storage,
  limits: LIMITS,
  fileFilter: (req, file, cb) => {
    if (MIMES_IMAGEN.includes(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, 'Solo se aceptan imágenes JPG, PNG o WEBP.'));
  },
});

/** Ruta relativa guardada en DB → basename, sólo si apunta a nuestro /uploads/public/. */
function _basenamePublicoLocal(valor) {
  if (typeof valor !== 'string' || !valor.includes('/uploads/public/')) return null;
  const base = path.basename(valor.split('?')[0]);
  return base && !base.includes('..') ? base : null;
}

/** Borra un archivo público local anterior (best-effort) + su fila Archivo. */
async function rmArchivoPublicoSiLocal(valor) {
  const base = _basenamePublicoLocal(valor);
  if (!base) return;
  try { fs.rmSync(path.join(PUBLIC_DIR, base), { force: true }); } catch { /* nada */ }
  try { await Archivo.destroy({ where: { claveAlmacenamiento: `/uploads/public/${base}` } }); } catch { /* nada */ }
}

/**
 * Valida y publica la imagen recién subida por multer.
 * @param {{ req, tipo: 'foto_perfil'|'logo_empresa', valorAnterior?: string }} opts
 * @returns {Promise<{ urlPublica: string, archivoId: string|null }>}
 */
async function procesarSubidaImagen({ req, tipo, valorAnterior }) {
  if (!req.file) throw new HttpError(400, 'No se subió ninguna imagen.');

  const buffer = fs.readFileSync(req.file.path);
  if (!firmaCoincide(buffer, req.file.mimetype)) {
    try { fs.rmSync(req.file.path, { force: true }); } catch { /* nada */ }
    throw new HttpError(400, 'El contenido del archivo no coincide con su tipo declarado.');
  }

  // Publicar: mover de uploads/ a uploads/public/
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  const destino = path.join(PUBLIC_DIR, req.file.filename);
  fs.renameSync(req.file.path, destino);

  // Borrar el anterior (si era una imagen local nuestra)
  await rmArchivoPublicoSiLocal(valorAnterior);

  const claveAlmacenamiento = `/uploads/public/${req.file.filename}`;

  // Fila Archivo — best-effort (auditoría / hash), no bloquea la subida.
  let archivoId = null;
  try {
    const archivo = await Archivo.create({
      usuarioPropietarioId: req.usuario.id,
      tipo,
      nombreOriginal: sanitizarNombreOriginal(req.file.originalname, req.file.mimetype),
      claveAlmacenamiento,
      mimeType: req.file.mimetype,
      tamanioBytes: req.file.size,
      hashSha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      backend: 'local',
    });
    archivoId = archivo.id;
  } catch (err) {
    logger.error({ err }, 'archivo_imagen_metadata_no_registrada');
  }

  const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  return { urlPublica: `${base}${claveAlmacenamiento}`, archivoId };
}

module.exports = { multerImagen, procesarSubidaImagen, rmArchivoPublicoSiLocal, PUBLIC_DIR };
