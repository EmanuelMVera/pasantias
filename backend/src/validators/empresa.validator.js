'use strict';

const { validarCampos } = require('./common.validator');

// `logo` se sube por POST /api/empresas/mi-empresa/logo (SEC-03), no por acá.
// Límites = columnas de empresas (empresa.model.js). `ciudad` sigue siendo
// texto libre hasta el bloque de autocompletado de ubicaciones.
const REGLAS_MI_EMPRESA = {
  descripcion: { tipo: 'texto', label: 'La descripción', max: 2000 },
  rubro:       { tipo: 'texto', label: 'El rubro', max: 150 },
  sitioWeb:    { tipo: 'url', label: 'El sitio web' },
  telefono:    { tipo: 'telefono', label: 'El teléfono' },
  direccion:   { tipo: 'texto', label: 'La dirección', max: 255 },
  ciudad:      { tipo: 'texto', label: 'La ciudad', max: 100 },
};

/**
 * Valida el body de PUT /api/empresas/mi-empresa.
 * @returns {{ error: string|null, datos?: object }}
 */
function validateUpdateEmpresa(body) {
  const camposValidos = Object.keys(REGLAS_MI_EMPRESA).filter((c) => body[c] !== undefined);
  if (camposValidos.length === 0) return { error: 'No se enviaron campos válidos para actualizar.' };
  return validarCampos(body, REGLAS_MI_EMPRESA, { parcial: true });
}

// Mi perfil del reclutador: solo sus datos personales. Email, rol, empresa,
// estado y password NO se editan acá; la foto va por su endpoint de imagen.
const CAMPOS_MI_PERFIL = { nombre: 100, apellido: 100, telefono: 30, ubicacion: 150 };
const REGLAS_MI_PERFIL = {
  nombre:    { tipo: 'texto', label: 'El nombre', requerido: true, max: CAMPOS_MI_PERFIL.nombre },
  apellido:  { tipo: 'texto', label: 'El apellido', requerido: true, max: CAMPOS_MI_PERFIL.apellido },
  telefono:  { tipo: 'telefono', label: 'El teléfono', max: CAMPOS_MI_PERFIL.telefono },
  ubicacion: { tipo: 'texto', label: 'La ubicación', max: CAMPOS_MI_PERFIL.ubicacion },
};

/**
 * Valida el body de PATCH /api/empresas/reclutadores/mi-perfil. Whitelist
 * estricta: cualquier otro campo (email, rol, fotoPerfil, activo…) es 400.
 * @returns {string|{ error: string|null, datos?: object }}
 */
function validateMiPerfilReclutador(body) {
  const claves = Object.keys(body ?? {});
  const ajenas = claves.filter((c) => !(c in CAMPOS_MI_PERFIL));
  if (ajenas.length) return `Campos no editables desde Mi perfil: ${ajenas.join(', ')}.`;
  if (claves.length === 0) return 'No se enviaron campos válidos para actualizar.';
  return validarCampos(body, REGLAS_MI_PERFIL, { parcial: true });
}

/**
 * Valida el body de POST /api/empresas/equipo/solicitar (el admin_empresa pide
 * sumar un reclutador). Antes solo se exigía que no estuvieran vacíos: un
 * email "abc" llegaba a la BD.
 */
function validateSolicitarReclutador(body) {
  return validarCampos(body, {
    nombre:   { tipo: 'texto', label: 'El nombre', requerido: true, max: 100 },
    apellido: { tipo: 'texto', label: 'El apellido', requerido: true, max: 100 },
    email:    { tipo: 'email', label: 'El email', requerido: true },
  });
}

module.exports = {
  validateUpdateEmpresa, validateMiPerfilReclutador, validateSolicitarReclutador, CAMPOS_MI_PERFIL,
};
