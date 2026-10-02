'use strict';

const { PASSWORD_MIN_LENGTH, esPasswordValida } = require('../utils/password');

/**
 * Valida el body de PUT /api/auth/cambiar-password.
 * @returns {string|null}
 */
function validateCambiarPassword(body) {
  const { passwordActual, nuevaPassword } = body;
  if (!passwordActual || !nuevaPassword) {
    return 'Debés proporcionar la contraseña actual y la nueva contraseña.';
  }
  if (!esPasswordValida(nuevaPassword)) {
    return `La nueva contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (passwordActual === nuevaPassword) {
    return 'La nueva contraseña debe ser diferente a la actual.';
  }
  return null;
}

module.exports = { validateCambiarPassword };
