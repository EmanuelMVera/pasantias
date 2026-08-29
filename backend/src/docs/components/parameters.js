'use strict';

// Parámetros reutilizables. Los específicos de un endpoint se declaran inline
// en el `paths/*.js` correspondiente.
module.exports = {
  pageParam: {
    name: 'page',
    in: 'query',
    required: false,
    description: 'Número de página (base 1).',
    schema: { type: 'integer', minimum: 1, default: 1 },
  },
  limitParam: {
    name: 'limit',
    in: 'query',
    required: false,
    description: 'Ítems por página. Se recorta al máximo del endpoint (12–100 según el caso).',
    schema: { type: 'integer', minimum: 1, default: 20 },
  },
  id: {
    name: 'id',
    in: 'path',
    required: true,
    schema: { type: 'integer', minimum: 1 },
  },
  csrfHeader: {
    name: 'X-CSRF-Token',
    in: 'header',
    required: true,
    description:
      'Double-submit CSRF: debe coincidir con la cookie `csrf_token`. Obligatorio en ' +
      'todos los métodos que mutan estado salvo los endpoints exentos (ver descripción de la API).',
    schema: { type: 'string' },
  },
  estadoQuery: {
    name: 'estado',
    in: 'query',
    required: false,
    description: 'Filtra por estado (valores según el recurso).',
    schema: { type: 'string' },
  },
  qQuery: {
    name: 'q',
    in: 'query',
    required: false,
    description: 'Texto de búsqueda.',
    schema: { type: 'string' },
  },
};
