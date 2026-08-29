'use strict';

// Respuestas de error reutilizables. Los ejemplos son textos reales del server
// (ver backend/src/middleware/{error,csrf,rateLimit,auth,empresa}.middleware.js).

const err = (description, example) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
      example,
    },
  },
});

module.exports = {
  ValidationError400: err('Body inválido — falta un campo requerido o un valor no es válido.', {
    success: false,
    message: 'Faltan campos obligatorios.',
  }),
  Error401: err('No autenticado — falta el token, es inválido o expiró.', {
    success: false,
    message: 'Token inválido o expirado.',
  }),
  Error403: err('Sin permisos para la acción (rol de sistema o rol interno de empresa).', {
    success: false,
    message: 'No tenés permisos para realizar esta acción.',
  }),
  Error403Csrf: err('Falta el header `X-CSRF-Token` o no coincide con la cookie `csrf_token`.', {
    success: false,
    code: 'CSRF',
    message: 'Token de seguridad inválido o ausente. Recargá la página e intentá de nuevo.',
  }),
  Error404: err('El recurso no existe o no es visible para este usuario.', {
    success: false,
    message: 'Recurso no encontrado.',
  }),
  Error404Empresa: err('El usuario no pertenece a ninguna empresa.', {
    success: false,
    code: 'SIN_EMPRESA',
    message: 'No tenés acceso a ninguna empresa. Necesitás ser invitado por un administrador.',
  }),
  Error429: err('Límite de tasa alcanzado (rate limiting).', {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Demasiadas solicitudes. Esperá un momento e intentá de nuevo.',
  }),
  Error500: err('Error interno no controlado.', {
    success: false,
    message: 'Error interno del servidor.',
    requestId: 'a1b2c3d4-...',
  }),
};
