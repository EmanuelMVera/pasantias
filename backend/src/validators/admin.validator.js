'use strict';

/**
 * admin.validator.js — formularios del administrador del sistema.
 *
 * La contraseña (mínimo 8) y el legajo los sigue validando
 * adminUsuarios.service.js: dependen de reglas propias (utils/password.js,
 * utils/legajo.js) y de la base (legajo único).
 */

const { validarCampos } = require('./common.validator');

const ROLES = ['alumno', 'egresado', 'empresa', 'admin'];
const MOTIVO_MAX = 1000;

const reglasUsuario = () => ({
  nombre:    { tipo: 'texto', label: 'El nombre', requerido: true, max: 100 },
  apellido:  { tipo: 'texto', label: 'El apellido', requerido: true, max: 100 },
  email:     { tipo: 'email', label: 'El email', requerido: true },
  rol:       { tipo: 'enum', label: 'El rol', requerido: true, valores: ROLES },
  telefono:  { tipo: 'telefono', label: 'El teléfono' },
  ubicacion: { tipo: 'texto', label: 'La ubicación', max: 150 },
});

/** POST /api/admin/usuarios */
function validateCrearUsuario(body) {
  return validarCampos(body, reglasUsuario());
}

/** PUT /api/admin/usuarios/:id — edición parcial. */
function validateActualizarUsuario(body) {
  return validarCampos(body, {
    ...reglasUsuario(),
    activo: { tipo: 'booleano', label: 'El estado activo' },
  }, { parcial: true });
}

/**
 * Motivo opcional de un rechazo / moderación (empresas, solicitudes, ofertas).
 * Texto acotado: termina en emails y notificaciones.
 */
function validateMotivo(body) {
  return validarCampos(body, { motivo: { tipo: 'texto', label: 'El motivo', max: MOTIVO_MAX } }, { parcial: true });
}

module.exports = {
  validateCrearUsuario, validateActualizarUsuario, validateMotivo, ROLES, MOTIVO_MAX,
};
