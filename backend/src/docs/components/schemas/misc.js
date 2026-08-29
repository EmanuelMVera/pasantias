'use strict';

// Cuerpos de respuesta que NO siguen el envelope `{ success, data }`.
// Se documentan como son de verdad (ver backend/src/controllers/*).

const wrap = (props, required) => ({
  allOf: [
    { $ref: '#/components/schemas/Envelope' },
    { type: 'object', required, properties: props },
  ],
});

module.exports = {
  LoginResponse: wrap(
    {
      token: {
        type: 'string',
        description: 'JWT. La sesión real es la cookie `token`; este campo es para clientes de API / la consola.',
      },
      usuario: { $ref: '#/components/schemas/UsuarioResumen' },
    },
    ['token', 'usuario'],
  ),

  AuthMeResponse: wrap({ usuario: { $ref: '#/components/schemas/Usuario' } }, ['usuario']),

  ForgotPasswordResponse: wrap(
    {
      message: { type: 'string' },
      devToken: {
        type: 'string',
        description: 'Solo fuera de producción y sin email configurado — token de reset en claro.',
      },
    },
    ['message'],
  ),

  UnreadCountResponse: wrap({ count: { type: 'integer' } }, ['count']),

  LogoUploadResponse: wrap(
    { message: { type: 'string' }, logo: { type: 'string' }, archivoId: { type: 'integer' } },
    ['message'],
  ),

  CvUploadResponse: wrap(
    { message: { type: 'string' }, cvPath: { type: 'string' }, cvArchivoId: { type: 'integer' } },
    ['message'],
  ),

  CartaUploadResponse: wrap(
    { message: { type: 'string' }, cartaRecomendacion: { type: 'string' }, cartaArchivoId: { type: 'integer' } },
    ['message'],
  ),

  FotoUploadResponse: wrap(
    { message: { type: 'string' }, fotoPerfil: { type: 'string' }, archivoId: { type: 'integer' } },
    ['message'],
  ),

  MarcarLeidaResponse: wrap(
    { success: { const: true }, message: { type: 'string' }, actualizados: { type: 'integer' } },
    ['message'],
  ),
};
