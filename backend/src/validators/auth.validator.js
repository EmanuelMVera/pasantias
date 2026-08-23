'use strict';

/**
 * Valida el body de PUT /api/auth/cambiar-password.
 * @returns {string|null}
 */
function validateCambiarPassword(body) {
  const { passwordActual, nuevaPassword } = body;
  if (!passwordActual || !nuevaPassword) {
    return 'Debés proporcionar la contraseña actual y la nueva contraseña.';
  }
  if (nuevaPassword.length < 6) {
    return 'La nueva contraseña debe tener al menos 6 caracteres.';
  }
  if (passwordActual === nuevaPassword) {
    return 'La nueva contraseña debe ser diferente a la actual.';
  }
  return null;
}

module.exports = { validateCambiarPassword };
