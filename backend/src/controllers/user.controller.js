const crypto = require('crypto');
const fs = require('fs');
const { Perfil, Usuario, Archivo } = require('../models');

// Crea la fila de metadata en `archivos` para un archivo recién subido por
// multer (EST-08 §5.4) y devuelve su id, para que el caller lo vincule desde
// Perfil.cvArchivoId/cartaArchivoId (SEC-01) — el acceso real ya no pasa por
// la ruta STRING/URL directa, sino por GET /api/archivos/:id.
async function registrarArchivo(req, tipo) {
  try {
    const buffer = fs.readFileSync(req.file.path);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const archivo = await Archivo.create({
      usuarioPropietarioId: req.usuario.id,
      tipo,
      nombreOriginal: req.file.originalname,
      claveAlmacenamiento: `/uploads/${req.file.filename}`,
      mimeType: req.file.mimetype,
      tamanioBytes: req.file.size,
      hashSha256: hash,
      backend: 'local',
    });
    return archivo.id;
  } catch (err) {
    console.error('[Archivo] No se pudo registrar metadata:', err.message);
    return null;
  }
}

const getPerfil = async (req, res) => {
  try {
    const perfil = await Perfil.findOne({ where: { usuarioId: req.usuario.id } });
    const usuario = await Usuario.findByPk(req.usuario.id, {
      attributes: ['telefono', 'ubicacion'],
    });
    const datos = perfil ? perfil.toJSON() : {};
    datos.telefono = usuario?.telefono || null;
    datos.ubicacion = usuario?.ubicacion || null;
    return res.json({ success: true, data: datos });
  } catch (err) {
    console.error('[GET /perfil] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Error al obtener el perfil.' });
  }
};

const updatePerfil = async (req, res) => {
  try {
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

    const camposPermitidos = [
      'carrera', 'anioEgreso', 'descripcion', 'habilidades', 'idiomas',
      'certificaciones', 'linkedin', 'github', 'portfolio', 'redesSociales',
      'fotoPerfil', 'areaInteres', 'disponibilidad', 'preferenciasLaborales',
      'salarioPretendido', 'visibilidadPerfil', 'experienciaLaboral', 'proyectos',
    ];
    const datosLimpios = Object.fromEntries(
      Object.entries(body).filter(([k]) => camposPermitidos.includes(k))
    );

    await Perfil.update(datosLimpios, { where: { usuarioId: req.usuario.id } });

    // Sincronizar fotoPerfil al modelo Usuario para que el auth context y Navbar lo muestren
    if (datosLimpios.fotoPerfil !== undefined) {
      await Usuario.update({ fotoPerfil: datosLimpios.fotoPerfil || null }, { where: { id: req.usuario.id } });
    }

    const perfil = await Perfil.findOne({ where: { usuarioId: req.usuario.id } });
    const usuarioActualizado = await Usuario.findByPk(req.usuario.id, {
      attributes: ['telefono', 'ubicacion'],
    });
    const datos = perfil ? perfil.toJSON() : {};
    datos.telefono = usuarioActualizado?.telefono || null;
    datos.ubicacion = usuarioActualizado?.ubicacion || null;

    return res.json({ success: true, data: datos });
  } catch (err) {
    console.error('[PUT /perfil] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Error al actualizar el perfil.' });
  }
};

const uploadCv = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No se subió ningún archivo.' });
    const cvPath = `/uploads/${req.file.filename}`;
    const cvArchivoId = await registrarArchivo(req, 'cv');
    await Perfil.update({ cvPath, cvArchivoId }, { where: { usuarioId: req.usuario.id } });
    return res.json({ success: true, message: 'CV subido correctamente.', cvPath, cvArchivoId });
  } catch {
    return res.status(500).json({ success: false, message: 'Error al subir el CV.' });
  }
};

const uploadCartaRecomendacion = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No se subió ningún archivo.' });
    const cartaRecomendacion = `/uploads/${req.file.filename}`;
    const cartaArchivoId = await registrarArchivo(req, 'carta_recomendacion');
    await Perfil.update({ cartaRecomendacion, cartaArchivoId }, { where: { usuarioId: req.usuario.id } });
    return res.json({ success: true, message: 'Carta de recomendación subida correctamente.', cartaRecomendacion, cartaArchivoId });
  } catch {
    return res.status(500).json({ success: false, message: 'Error al subir la carta de recomendación.' });
  }
};

const getPerfilPublico = async (req, res) => {
  try {
    const usuario = await Usuario.findOne({
      where: { id: req.params.id, activo: true },
      attributes: ['id', 'nombre', 'apellido', 'rol', 'fotoPerfil', 'ubicacion'],
    });
    if (!usuario || !['alumno', 'egresado'].includes(usuario.rol)) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
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

    // visibilidadPerfil es BOOLEAN: false → privado
    if (perfil && perfil.visibilidadPerfil === false) {
      return res.status(403).json({ success: false, message: 'Este perfil es privado.', code: 'PERFIL_PRIVADO' });
    }

    const { visibilidadPerfil, ...perfilPublico } = perfil ? perfil.toJSON() : {};
    return res.json({
      success: true,
      data: {
        ...usuario.toJSON(),
        perfil: perfil ? perfilPublico : null,
      },
    });
  } catch (err) {
    console.error('[GET /:id/perfil]', err.message);
    return res.status(500).json({ success: false, message: 'Error al obtener el perfil.' });
  }
};

module.exports = {
  getPerfil,
  updatePerfil,
  uploadCv,
  uploadCartaRecomendacion,
  getPerfilPublico,
};
