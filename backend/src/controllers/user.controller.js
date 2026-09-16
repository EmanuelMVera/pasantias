const crypto = require('crypto');
const { Perfil, Usuario, Archivo } = require('../models');
const HttpError = require('../utils/httpError');
const { EXT_POR_MIME, firmaCoincide, sanitizarNombreOriginal } = require('../utils/archivoNombre');
const { procesarSubidaImagen, establecerUrlExterna } = require('../services/archivoImagen.service');
const storage = require('../services/storage');
const logger = require('../utils/logger');

/**
 * SEC-02: verifica que el CONTENIDO del archivo coincida con el mimetype que
 * declaró el cliente (multer solo mira el header multipart, falsificable). Con
 * memoryStorage el archivo está en `req.file.buffer` — no hay temp file que
 * limpiar. Devuelve el buffer para reusarlo en el hash y la subida.
 */
function validarContenidoArchivo(req) {
  const buffer = req.file.buffer;
  if (!firmaCoincide(buffer, req.file.mimetype)) {
    throw new HttpError(400, 'El contenido del archivo no coincide con su tipo declarado.');
  }
  return buffer;
}

// Sube el archivo privado al backend activo (DEPLOY-01) y registra su fila
// `archivos` (EST-08 §5.4 / SEC-01). El acceso real va por GET /api/archivos/:id.
// AUTORITATIVO: si falla el registro de metadata, se borra el objeto recién
// subido y se propaga el error — nunca queda un objeto sin referencia ni una
// referencia inválida en DB.
async function registrarArchivo(req, tipo, buffer) {
  const ext = EXT_POR_MIME[req.file.mimetype] || '.bin';
  const key = storage.keyFor('private', { tipo, ext });

  await storage.primary.putObject({
    key, body: buffer, contentType: req.file.mimetype, area: 'private',
  });

  try {
    const archivo = await Archivo.create({
      usuarioPropietarioId: req.usuario.id,
      tipo,
      nombreOriginal: sanitizarNombreOriginal(req.file.originalname, req.file.mimetype),
      claveAlmacenamiento: key,
      mimeType: req.file.mimetype,
      tamanioBytes: buffer.length,
      hashSha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      backend: storage.primaryName,
    });
    return { archivoId: archivo.id, key };
  } catch (err) {
    await storage.primary.deleteObject(key, { area: 'private' }).catch((e) =>
      logger.warn({ err: { name: e.name, message: e.message } }, 'cleanup_archivo_tras_fallo_db'));
    throw err;
  }
}

const getPerfil = async (req, res) => {
  const perfil = await Perfil.findOne({ where: { usuarioId: req.usuario.id } });
  const usuario = await Usuario.findByPk(req.usuario.id, {
    attributes: ['telefono', 'ubicacion'],
  });
  const datos = perfil ? perfil.toJSON() : {};
  datos.telefono = usuario?.telefono || null;
  datos.ubicacion = usuario?.ubicacion || null;
  return res.json({ success: true, data: datos });
};

const updatePerfil = async (req, res) => {
  const body = { ...req.body };

  // PostgreSQL no puede hacer el cast de '' → ARRAY
  ['habilidades', 'idiomas', 'certificaciones'].forEach((campo) => {
    if (body[campo] === undefined || body[campo] === null) return;
    if (typeof body[campo] === 'string') {
      try {
        const parsed = JSON.parse(body[campo]);
        body[campo] = Array.isArray(parsed) ? parsed : [];
      } catch {
        body[campo] = body[campo].trim() ? body[campo].split(',').map(s => s.trim()).filter(Boolean) : [];
      }
    } else if (!Array.isArray(body[campo])) {
      body[campo] = [];
    }
  });

  // redesSociales viene como string desde el frontend; se guarda como JSONB
  if (body.redesSociales !== undefined) {
    if (typeof body.redesSociales === 'string') {
      body.redesSociales = body.redesSociales.trim()
        ? { texto: body.redesSociales.trim() }
        : null;
    }
  }

  if (body.visibilidadPerfil !== undefined) {
    if (typeof body.visibilidadPerfil === 'string') {
      body.visibilidadPerfil = body.visibilidadPerfil === 'true' || body.visibilidadPerfil === 'publica';
    }
  }

  // telefono/ubicacion pertenecen al modelo Usuario, no a Perfil
  const datosUsuario = {};
  if (body.telefono !== undefined) datosUsuario.telefono = body.telefono?.trim() || null;
  if (body.ubicacion !== undefined) datosUsuario.ubicacion = body.ubicacion?.trim() || null;
  if (Object.keys(datosUsuario).length > 0) {
    await Usuario.update(datosUsuario, { where: { id: req.usuario.id } });
  }

  // SEC-03: `fotoPerfil` ya NO se acepta por texto libre — se sube por
  // POST /api/users/perfil/foto (multipart, validado). Las URLs externas
  // cargadas antes de SEC-03 quedan hasta que se reemplacen por una subida.
  const camposPermitidos = [
    'carrera', 'anioEgreso', 'descripcion', 'habilidades', 'idiomas',
    'certificaciones', 'linkedin', 'github', 'portfolio', 'redesSociales',
    'areaInteres', 'disponibilidad', 'preferenciasLaborales',
    'salarioPretendido', 'visibilidadPerfil', 'experienciaLaboral', 'proyectos',
  ];
  const datosLimpios = Object.fromEntries(
    Object.entries(body).filter(([k]) => camposPermitidos.includes(k))
  );

  await Perfil.update(datosLimpios, { where: { usuarioId: req.usuario.id } });

  const perfil = await Perfil.findOne({ where: { usuarioId: req.usuario.id } });
  const usuarioActualizado = await Usuario.findByPk(req.usuario.id, {
    attributes: ['telefono', 'ubicacion'],
  });
  const datos = perfil ? perfil.toJSON() : {};
  datos.telefono = usuarioActualizado?.telefono || null;
  datos.ubicacion = usuarioActualizado?.ubicacion || null;

  return res.json({ success: true, data: datos });
};

const uploadCv = async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No se subió ningún archivo.');
  const buffer = validarContenidoArchivo(req);
  const { archivoId: cvArchivoId, key: cvPath } = await registrarArchivo(req, 'cv', buffer);
  // cvPath: string legacy que postulacionService.validarPostulacion necesita
  // truthy; el acceso real es por cvArchivoId → GET /api/archivos/:id.
  await Perfil.update({ cvPath, cvArchivoId }, { where: { usuarioId: req.usuario.id } });
  return res.json({ success: true, message: 'CV subido correctamente.', cvPath, cvArchivoId });
};

const uploadCartaRecomendacion = async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No se subió ningún archivo.');
  const buffer = validarContenidoArchivo(req);
  const { archivoId: cartaArchivoId, key: cartaRecomendacion } = await registrarArchivo(req, 'carta_recomendacion', buffer);
  await Perfil.update({ cartaRecomendacion, cartaArchivoId }, { where: { usuarioId: req.usuario.id } });
  return res.json({ success: true, message: 'Carta de recomendación subida correctamente.', cartaRecomendacion, cartaArchivoId });
};

// SEC-03: subida de foto de perfil (imagen pública, validada, nombre server-side).
// Acepta también una URL https externa en vez de un archivo (multer no toca
// req.body cuando el Content-Type no es multipart — ver archivoImagen.service.js).
const uploadFoto = async (req, res) => {
  const perfil = await Perfil.findOne({ where: { usuarioId: req.usuario.id }, attributes: ['fotoPerfil'] });

  let urlPublica;
  let archivoId = null;
  if (req.body?.urlExterna !== undefined) {
    ({ urlPublica } = await establecerUrlExterna({ urlExterna: req.body.urlExterna, valorAnterior: perfil?.fotoPerfil }));
  } else {
    ({ urlPublica, archivoId } = await procesarSubidaImagen({
      req, tipo: 'foto_perfil', valorAnterior: perfil?.fotoPerfil,
    }));
  }

  await Perfil.update({ fotoPerfil: urlPublica }, { where: { usuarioId: req.usuario.id } });
  // Sync a Usuario.fotoPerfil (lo usan AuthContext / Navbar / listados).
  await Usuario.update({ fotoPerfil: urlPublica }, { where: { id: req.usuario.id } });

  return res.json({ success: true, message: 'Foto de perfil actualizada.', fotoPerfil: urlPublica, archivoId });
};

const getPerfilPublico = async (req, res) => {
  const usuario = await Usuario.findOne({
    where: { id: req.params.id, activo: true },
    attributes: ['id', 'nombre', 'apellido', 'rol', 'fotoPerfil', 'ubicacion'],
  });
  if (!usuario || !['alumno', 'egresado'].includes(usuario.rol)) {
    throw new HttpError(404, 'Usuario no encontrado.');
  }

  const perfil = await Perfil.findOne({
    where: { usuarioId: req.params.id },
    attributes: [
      'fotoPerfil',
      'carrera', 'anioEgreso', 'descripcion', 'habilidades', 'idiomas',
      'certificaciones', 'linkedin', 'github', 'portfolio', 'cvPath', 'cvArchivoId',
      'areaInteres', 'disponibilidad', 'experienciaLaboral', 'proyectos',
      'visibilidadPerfil',
    ],
  });

  // visibilidadPerfil es BOOLEAN: false → privado. El admin del sistema puede
  // ver cualquier perfil (moderación); el resto respeta la preferencia.
  if (perfil && perfil.visibilidadPerfil === false && req.usuario?.rol !== 'admin') {
    const err = new HttpError(403, 'Este perfil es privado.');
    err.code = 'PERFIL_PRIVADO';
    throw err;
  }

  const { visibilidadPerfil, ...perfilPublico } = perfil ? perfil.toJSON() : {};
  return res.json({
    success: true,
    data: {
      ...usuario.toJSON(),
      perfil: perfil ? perfilPublico : null,
    },
  });
};

module.exports = {
  getPerfil,
  updatePerfil,
  uploadCv,
  uploadCartaRecomendacion,
  uploadFoto,
  getPerfilPublico,
};
