'use strict';
const { operation, ok, REF } = require('../helpers');

const T = 'usuarios';
const named = (name) => ({ description: 'OK', content: { 'application/json': { schema: REF.schema(name) } } });
const multipart = (field) => ({
  type: 'object', required: [field],
  properties: { [field]: { type: 'string', format: 'binary' } },
});

module.exports = {
  '/api/users/perfil': {
    get: operation({
      tag: T, id: 'usuariosGetPerfil', summary: 'Mi perfil (usuario + perfil académico)',
      responses: { 200: ok('Perfil') }, errors: ['401'],
    }),
    put: operation({
      tag: T, id: 'usuariosUpdatePerfil', summary: 'Actualizar mi perfil académico',
      roles: ['alumno', 'egresado'], csrf: true, body: 'PerfilUpdate',
      responses: { 200: ok('Perfil') }, errors: ['400', '401', '403', '403csrf'],
    }),
  },

  '/api/users/perfil/cv': {
    post: operation({
      tag: T, id: 'usuariosUploadCv', summary: 'Subir el CV (PDF)',
      roles: ['alumno', 'egresado'], csrf: true,
      body: multipart('cv'), bodyContentType: 'multipart/form-data',
      bodyDescription: 'multipart/form-data con el campo `cv` (application/pdf, máx. 5 MB).',
      responses: { 200: named('CvUploadResponse') },
      errors: ['400', '401', '403', '403csrf', '429'],
    }),
  },

  '/api/users/perfil/carta-recomendacion': {
    post: operation({
      tag: T, id: 'usuariosUploadCarta', summary: 'Subir la carta de recomendación (PDF o imagen)',
      roles: ['alumno', 'egresado'], csrf: true,
      body: multipart('carta'), bodyContentType: 'multipart/form-data',
      bodyDescription: 'multipart/form-data con el campo `carta` (PDF / JPG / PNG / WEBP, máx. 5 MB).',
      responses: { 200: named('CartaUploadResponse') },
      errors: ['400', '401', '403', '403csrf', '429'],
    }),
  },

  '/api/users/perfil/foto': {
    post: operation({
      tag: T, id: 'usuariosUploadFoto', summary: 'Subir la foto de perfil (imagen)',
      roles: ['alumno', 'egresado'], csrf: true,
      body: multipart('foto'), bodyContentType: 'multipart/form-data',
      bodyDescription: 'multipart/form-data con el campo `foto` (imagen validada por magic bytes, máx. 2 MB).',
      responses: { 200: named('FotoUploadResponse') },
      errors: ['400', '401', '403', '403csrf', '429'],
    }),
  },

  '/api/users/{id}/perfil': {
    get: operation({
      tag: T, id: 'usuariosGetPerfilPublico', summary: 'Perfil público de otro usuario',
      description: 'Respeta `visibilidadPerfil`. Cualquier usuario autenticado.',
      params: ['id'],
      responses: { 200: ok('Perfil') },
      errors: ['401', '403', '404'],
    }),
  },
};
