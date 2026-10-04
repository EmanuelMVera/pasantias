'use strict';

const { esUrlValida } = require('./common.validator');

// `logo` se sube por POST /api/empresas/mi-empresa/logo (SEC-03), no por acá.
const CAMPOS_EDITABLES = ['descripcion', 'rubro', 'sitioWeb', 'telefono', 'direccion', 'ciudad'];

/**
 * Valida el body de PUT /api/empresas/mi-empresa.
 * @returns {string|null}
 */
function validateUpdateEmpresa(body) {
  const camposValidos = CAMPOS_EDITABLES.filter((c) => body[c] !== undefined);
  if (camposValidos.length === 0) return 'No se enviaron campos válidos para actualizar.';
  if (body.sitioWeb && !esUrlValida(body.sitioWeb)) return 'El sitio web no tiene un formato de URL válido.';
  return null;
}

// Mi perfil del reclutador: solo sus datos personales. Email, rol, empresa,
// estado y password NO se editan acá; la foto va por su endpoint de imagen.
const CAMPOS_MI_PERFIL = { nombre: 100, apellido: 100, telefono: 30, ubicacion: 150 };
const OBLIGATORIOS_MI_PERFIL = ['nombre', 'apellido'];

/**
 * Valida el body de PATCH /api/empresas/reclutadores/mi-perfil. Whitelist
 * estricta: cualquier otro campo (email, rol, fotoPerfil, activo…) es 400.
 * @returns {string|null}
 */
function validateMiPerfilReclutador(body) {
  const claves = Object.keys(body ?? {});
  const ajenas = claves.filter((c) => !(c in CAMPOS_MI_PERFIL));
  if (ajenas.length) return `Campos no editables desde Mi perfil: ${ajenas.join(', ')}.`;
  if (claves.length === 0) return 'No se enviaron campos válidos para actualizar.';

  for (const [campo, max] of Object.entries(CAMPOS_MI_PERFIL)) {
    const valor = body[campo];
    if (valor === undefined) continue;
    const obligatorio = OBLIGATORIOS_MI_PERFIL.includes(campo);
    if (valor === null && !obligatorio) continue;
    if (typeof valor !== 'string') return `El campo ${campo} debe ser texto.`;
    if (obligatorio && !valor.trim()) return `El campo ${campo} no puede quedar vacío.`;
    if (valor.trim().length > max) return `El campo ${campo} admite hasta ${max} caracteres.`;
  }
  return null;
}

module.exports = { validateUpdateEmpresa, validateMiPerfilReclutador, CAMPOS_MI_PERFIL };
