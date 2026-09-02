const crypto = require('crypto');
const fs = require('fs');
const { Perfil, Usuario, Archivo } = require('../models');
const HttpError = require('../utils/httpError');
const { firmaCoincide, sanitizarNombreOriginal } = require('../utils/archivoNombre');
const { procesarSubidaImagen } = require('../services/archivoImagen.service');
const logger = require('../utils/logger');

/**
 * SEC-02: verifica que el CONTENIDO del archivo coincida con el mimetype que
 * declaró el cliente (multer solo mira el header multipart, falsificable).
 * Si no coincide, borra el archivo del disco y lanza 400 (propaga a
 * error.middleware). Devuelve el buffer ya leído para reusarlo en el hash.
 */
function validarContenidoArchivo(req) {
  const buffer = fs.readFileSync(req.file.path);
  if (!firmaCoincide(buffer, req.file.mimetype)) {
    try { fs.rmSync(req.file.path, { force: true }); } catch { /* nada */ }
    throw new HttpError(400, 'El contenido del archivo no coincide con su tipo declarado.');
  }
  return buffer;
}

// Crea la fila de metadata en `archivos` para un archivo recién subido por
// multer (EST-08 §5.4) y devuelve su id, para que el caller lo vincule desde
// Perfil.cvArchivoId/cartaArchivoId (SEC-01) — el acceso real ya no pasa por
// la ruta STRING/URL directa, sino por GET /api/archivos/:id.
// Soft-fail deliberado: si falla el registro de metadata, la subida del
// archivo en sí no debe fallar (REF-ERR-01: se mantiene igual).
async function registrarArchivo(req, tipo, buffer) {
  try {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const archivo = await Archivo.create({
      usuarioPropietarioId: req.usuario.id,
      tipo,
      nombreOriginal: sanitizarNombreOriginal(req.file.originalname, req.file.mimetype),
      claveAlmacenamiento: `/uploads/${req.file.filename}`,
      mimeType: req.file.mimetype,
      tamanioBytes: req.file.size,
      hashSha256: hash,
      backend: 'local',
    });
    return archivo.id;
  } catch (err) {
    logger.error({ err }, 'archivo_metadata_no_registrada');
    return null;
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
  const cvPath = `/uploads/${req.file.filename}`;
  const cvArchivoId = await registrarArchivo(req, 'cv', buffer);
  await Perfil.update({ cvPath, cvArchivoId }, { where: { usuarioId: req.usuario.id } });
  return res.json({ success: true, message: 'CV subido correctamente.', cvPath, cvArchivoId });
};

const uploadCartaRecomendacion = async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No se subió ningún archivo.');
  const buffer = validarContenidoArchivo(req);
  const cartaRecomendacion = `/uploads/${req.file.filename}`;
  const cartaArchivoId = await registrarArchivo(req, 'carta_recomendacion', buffer);
  await Perfil.update({ cartaRecomendacion, cartaArchivoId }, { where: { usuarioId: req.usuario.id } });
  return res.json({ success: true, message: 'Carta de recomendación subida correctamente.', cartaRecomendacion, cartaArchivoId });
};

// SEC-03: subida de foto de perfil (imagen pública, validada, nombre server-side).
const uploadFoto = async (req, res) => {
  const perfil = await Perfil.findOne({ where: { usuarioId: req.usuario.id }, attributes: ['fotoPerfil'] });
  const { urlPublica, archivoId } = await procesarSubidaImagen({
    req, tipo: 'foto_perfil', valorAnterior: perfil?.fotoPerfil,
  });

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
