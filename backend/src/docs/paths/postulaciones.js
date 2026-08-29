'use strict';
const { operation, paginated, message, REF } = require('../helpers');

const T = 'postulaciones';

module.exports = {
  '/api/postulaciones': {
    post: operation({
      tag: T, id: 'postulacionesCrear', summary: 'Postularme a una oferta',
      description: 'Requiere tener un CV subido. El CV se snapshotea en la postulación.',
      roles: ['alumno', 'egresado'], csrf: true, body: 'PostulacionCreate',
      responses: { 201: message({ data: REF.schema('Postulacion') }, { code: 201 }) },
      errors: ['400', '401', '403', '403csrf', '404', '429'],
    }),
  },

  '/api/postulaciones/mis': {
    get: operation({
      tag: T, id: 'postulacionesMias', summary: 'Mis postulaciones',
      roles: ['alumno', 'egresado'],
      query: ['pageParam', 'limitParam', REF.param('estadoQuery')],
      responses: {
        200: paginated('Postulacion', {
          extraProps: { conteoPorEstado: { type: 'object', additionalProperties: { type: 'integer' } } },
        }),
      },
      errors: ['401', '403'],
    }),
  },

  '/api/postulaciones/oferta/{ofertaId}': {
    get: operation({
      tag: T, id: 'postulacionesByOferta', summary: 'Candidatos de una oferta de mi empresa',
      roles: ['empresa/admin_empresa', 'empresa/reclutador'],
      params: [{ name: 'ofertaId', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }],
      query: ['pageParam', 'limitParam', REF.param('estadoQuery')],
      responses: {
        200: paginated('Postulacion', {
          extraProps: {
            conteoPorEstado: { type: 'object', additionalProperties: { type: 'integer' } },
            oferta: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                titulo: { type: 'string' },
                habilidadesRequeridas: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        }),
      },
      errors: ['401', '403', '404'],
    }),
  },

  '/api/postulaciones/{id}/estado': {
    patch: operation({
      tag: T, id: 'postulacionesUpdateEstado', summary: 'Cambiar el estado de una postulación',
      roles: ['empresa/admin_empresa', 'empresa/reclutador'],
      csrf: true, params: ['id'], body: 'PostulacionEstadoUpdate',
      responses: { 200: message({ data: REF.schema('Postulacion') }) },
      errors: ['400', '401', '403', '403csrf', '404'],
    }),
  },
};
