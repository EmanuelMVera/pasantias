'use strict';
const { operation, file } = require('../helpers');

module.exports = {
  '/api/archivos/{id}': {
    get: operation({
      tag: 'archivos', id: 'archivosDescargar', summary: 'Descargar un archivo privado (CV / carta)',
      description:
        'Autenticado + autorización fina en el controller: solo el **propietario** del archivo, ' +
        'un **admin**, o una **empresa** con una postulación del alumno a una de sus ofertas.',
      params: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: { 200: file('application/octet-stream', 'El archivo (stream binario).') },
      errors: ['401', '403', '404'],
    }),
  },
};
