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
const path = require('path');
const { verifyToken, authorizeRoles } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { validateUpdatePerfil } = require('../validators/user.validator');
const {
  getPerfil,
  updatePerfil,
  uploadCv,
  uploadCartaRecomendacion,
  getPerfilPublico,
} = require('../controllers/user.controller');

// ── Configuración de multer ───────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
  filename: (req, file, cb) => {
    const prefix = file.fieldname === 'carta' ? 'carta' : 'cv';
    cb(null, `${prefix}_${req.usuario.id}_${Date.now()}${path.extname(file.originalname)}`);
  },
});

const uploadCV = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Solo se aceptan archivos PDF.'));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadCarta = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const permitidos = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (permitidos.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se aceptan PDF o imágenes (JPG, PNG, WEBP).'));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ── Rutas ─────────────────────────────────────────────────────────────────────
router.get('/perfil',                    verifyToken,                                    getPerfil);
// QA-01: valida que llegue al menos un campo reconocido antes del controller
// (la sanitización/coerción de tipos sigue viviendo en el controller, no se duplica acá).
router.put('/perfil',                    verifyToken, authorizeRoles('alumno', 'egresado'), validate(validateUpdatePerfil), updatePerfil);
router.post('/perfil/cv',               verifyToken, authorizeRoles('alumno', 'egresado'), uploadCV.single('cv'),     uploadCv);
router.post('/perfil/carta-recomendacion', verifyToken, authorizeRoles('alumno', 'egresado'), uploadCarta.single('carta'), uploadCartaRecomendacion);
router.get('/:id/perfil',               verifyToken,                                    getPerfilPublico);

module.exports = router;
