'use strict';

/**
 * password.js — regla única de largo mínimo de contraseña.
 *
 * Se aplica a TODA contraseña que elige una persona: cambiar contraseña,
 * restablecer/activar por token, alta y edición de usuarios desde el panel del
 * administrador, y las contraseñas de los admins sembrados por variable de
 * entorno (SEED_ADMIN_PASSWORD). No se valida en el login: las cuentas que ya
 * tenían una contraseña más corta siguen pudiendo ingresar.
 */

const PASSWORD_MIN_LENGTH = 8;

const MENSAJE_PASSWORD_CORTA = `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;

/** true si `password` es un string con el largo mínimo. */
function esPasswordValida(password) {
  return typeof password === 'string' && password.length >= PASSWORD_MIN_LENGTH;
}

module.exports = { PASSWORD_MIN_LENGTH, MENSAJE_PASSWORD_CORTA, esPasswordValida };
