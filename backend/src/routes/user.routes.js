/**
 * user.routes.js — Rutas del perfil de usuario (alumno/egresado).
 *
 * Prefijo de la API: /api/users
 *
 * Permite a los alumnos y egresados:
 * - Ver y editar su perfil académico/profesional
 * - Subir su CV en formato PDF
 * - Consultar el perfil público de otro usuario
 */

const router = require('express').Router();
const multer = require('multer');
const { verifyToken, authorizeRoles } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { validateUpdatePerfil } = require('../validators/user.validator');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { uploadLimiter } = require('../middleware/rateLimit');
const { multerImagen } = require('../services/archivoImagen.service');
const {
  getPerfil,
  updatePerfil,
  uploadCv,
  uploadCartaRecomendacion,
  uploadFoto,
  getPerfilPublico,
} = require('../controllers/user.controller');

// ── Configuración de multer ───────────────────────────────────────────────────
// DEPLOY-01: memoryStorage — el archivo va a memoria y de ahí al backend de
// almacenamiento (local o S3/R2). No depende de temp files en disco (efímeros
// en Render). El nombre/objeto lo genera server-side el storage (UUID), nunca
// se usa file.originalname (input del atacante).
const storage = multer.memoryStorage();

// SEC-02: límites de multipart contra abuso (además del tamaño).
const LIMITS = { fileSize: 5 * 1024 * 1024, files: 1, parts: 10, fields: 5 };

const uploadCV = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new HttpError(400, 'Solo se aceptan archivos PDF.'));
  },
  limits: LIMITS,
});

const uploadCarta = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const permitidos = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (permitidos.includes(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, 'Solo se aceptan PDF o imágenes (JPG, PNG, WEBP).'));
  },
  limits: LIMITS,
});

// ── Rutas ─────────────────────────────────────────────────────────────────────
router.get('/perfil',                    verifyToken,                                    asyncHandler(getPerfil));
// QA-01: valida que llegue al menos un campo reconocido antes del controller
// (la sanitización/coerción de tipos sigue viviendo en el controller, no se duplica acá).
router.put('/perfil',                    verifyToken, authorizeRoles('alumno', 'egresado'), validate(validateUpdatePerfil), asyncHandler(updatePerfil));
router.post('/perfil/cv',               verifyToken, authorizeRoles('alumno', 'egresado'), uploadLimiter, uploadCV.single('cv'),     asyncHandler(uploadCv));
router.post('/perfil/carta-recomendacion', verifyToken, authorizeRoles('alumno', 'egresado'), uploadLimiter, uploadCarta.single('carta'), asyncHandler(uploadCartaRecomendacion));
router.post('/perfil/foto',             verifyToken, authorizeRoles('alumno', 'egresado'), uploadLimiter, multerImagen.single('foto'), asyncHandler(uploadFoto));
router.get('/:id/perfil',               verifyToken,                                    asyncHandler(getPerfilPublico));

module.exports = router;
