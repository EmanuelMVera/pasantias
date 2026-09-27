'use strict';
const { operation, paginated, message, REF } = require('../helpers');

const T = 'notificaciones';

module.exports = {
  '/api/notificaciones': {
    get: operation({
      tag: T, id: 'notificacionesList', summary: 'Mis notificaciones',
      query: [
        'pageParam', 'limitParam',
        { name: 'leida', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
      ],
      responses: {
        200: paginated('Notificacion', {
          extraProps: { sinLeer: { type: 'integer' } },
        }),
      },
      errors: ['401'],
    }),
  },

  '/api/notificaciones/sin-leer-count': {
    get: operation({
      tag: T, id: 'notificacionesSinLeerCount', summary: 'Cantidad de notificaciones sin leer',
      responses: { 200: { description: 'OK', content: { 'application/json': { schema: REF.schema('UnreadCountResponse') } } } },
      errors: ['401'],
    }),
  },

  '/api/notificaciones/leer-todas': {
    patch: operation({
      tag: T, id: 'notificacionesLeerTodas', summary: 'Marcar todas como leídas',
      csrf: true,
      responses: { 200: message() },
      errors: ['401', '403csrf'],
    }),
  },

  '/api/notificaciones/{id}/leer': {
    patch: operation({
      tag: T, id: 'notificacionesLeerUna', summary: 'Marcar una notificación como leída',
      csrf: true, params: ['id'],
      responses: { 200: message() },
      errors: ['401', '403csrf'],
    }),
  },

  '/api/notificaciones/leidas': {
    delete: operation({
      tag: T, id: 'notificacionesEliminarLeidas', summary: 'Eliminar mis notificaciones ya leídas',
      description: 'Borra solo las notificaciones del usuario autenticado con `leida=true`. Las no leídas y las de otros usuarios no se tocan.',
      csrf: true,
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: {
            type: 'object', required: ['success', 'eliminadas'],
            properties: { success: { type: 'boolean' }, eliminadas: { type: 'integer', minimum: 0 } },
          } } },
        },
      },
      errors: ['401', '403csrf'],
    }),
  },

  '/api/notificaciones/{id}': {
    delete: operation({
      tag: T, id: 'notificacionesEliminar', summary: 'Eliminar una notificación',
      csrf: true, params: ['id'],
      responses: { 200: message() },
      errors: ['401', '403csrf'],
    }),
  },
};
