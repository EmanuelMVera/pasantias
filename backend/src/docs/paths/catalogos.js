'use strict';
const { operation, okRaw } = require('../helpers');

module.exports = {
  '/api/catalogos/carreras': {
    get: operation({
      tag: 'catalogos', id: 'catalogosCarreras', summary: 'Catálogo institucional de carreras',
      description:
        'Público, sin autenticación (lo usa el formulario público de solicitud de empresa). ' +
        'Fuente única (`backend/src/data/catalogos.json`): contra esta lista se validan ' +
        '`carrerasDestinatarias` de las ofertas, `carrerasInteres` de la solicitud de empresa y ' +
        'la columna `carrera` de la importación CSV.',
      security: [],
      responses: {
        200: okRaw({ data: { type: 'array', items: { type: 'string' } } }, ['data']),
      },
    }),
  },
};
