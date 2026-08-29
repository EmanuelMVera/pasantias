'use strict';
const { operation, message, REF } = require('../helpers');

const T = 'auth';

// respuesta 2xx que referencia un schema con nombre (para los envelopes no-`data`)
const named = (name, description = 'OK') => ({
  description,
  content: { 'application/json': { schema: REF.schema(name) } },
});

module.exports = {
  '/api/auth/login': {
    post: operation({
      tag: T, id: 'authLogin', summary: 'Iniciar sesión',
      description: 'Setea la cookie `token` (HttpOnly) y además devuelve el `token` en el body. CSRF exento.',
      security: [],
      body: {
        type: 'object', required: ['email', 'password'],
        properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
      },
      responses: { 200: named('LoginResponse') },
      errors: ['401', '429'],
    }),
  },

  '/api/auth/logout': {
    post: operation({
      tag: T, id: 'authLogout', summary: 'Cerrar sesión',
      description: 'Borra la cookie `token`. No requiere autenticación. CSRF exento.',
      security: [],
      responses: { 200: message() },
    }),
  },

  '/api/auth/me': {
    get: operation({
      tag: T, id: 'authMe', summary: 'Usuario de la sesión actual',
      responses: { 200: named('AuthMeResponse') },
      errors: ['401'],
    }),
  },

  '/api/auth/forgot-password': {
    post: operation({
      tag: T, id: 'authForgotPassword', summary: 'Solicitar recuperación de contraseña',
      description: 'Responde siempre 200 con un mensaje genérico (no revela si el email existe). CSRF exento.',
      security: [],
      body: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } },
      responses: { 200: named('ForgotPasswordResponse') },
      errors: ['400', '429'],
    }),
  },

  '/api/auth/reset-password/{token}': {
    post: operation({
      tag: T, id: 'authResetPassword', summary: 'Restablecer contraseña con token',
      description: 'CSRF exento. Invalida las sesiones previas (bump de `tokenVersion`).',
      security: [],
      params: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }],
      body: { type: 'object', required: ['password'], properties: { password: { type: 'string', minLength: 6 } } },
      responses: { 200: message() },
      errors: ['400', '429'],
    }),
  },

  '/api/auth/cambiar-password': {
    put: operation({
      tag: T, id: 'authCambiarPassword', summary: 'Cambiar la contraseña propia',
      csrf: true,
      body: {
        type: 'object', required: ['passwordActual', 'nuevaPassword'],
        properties: {
          passwordActual: { type: 'string' },
          nuevaPassword: { type: 'string', minLength: 6, description: 'Debe diferir de la actual.' },
        },
      },
      responses: { 200: message() },
      errors: ['400', '401', '403csrf', '404'],
    }),
  },
};
