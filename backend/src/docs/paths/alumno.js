'use strict';
const { operation, ok } = require('../helpers');

module.exports = {
  '/api/students/dashboard': {
    get: operation({
      tag: 'alumno', id: 'alumnoDashboard', summary: 'Panel del alumno / egresado',
      description: 'Métricas personales, ofertas recomendadas y % de completitud del perfil.',
      roles: ['alumno', 'egresado'],
      responses: { 200: ok('DashboardAlumno') },
      errors: ['401', '403'],
    }),
  },

  '/api/ofertas/recomendadas': {
    get: operation({
      tag: 'alumno', id: 'alumnoOfertasRecomendadas', summary: 'Ofertas recomendadas para mi perfil',
      roles: ['alumno', 'egresado'],
      query: ['pageParam', 'limitParam'],
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/Envelope' },
                  {
                    type: 'object',
                    required: ['data', 'pagination'],
                    properties: {
                      data: { type: 'array', items: { $ref: '#/components/schemas/Oferta' } },
                      pagination: { $ref: '#/components/schemas/Pagination' },
                      criterios: { type: 'object', additionalProperties: true },
                    },
                  },
                ],
              },
            },
          },
        },
      },
      errors: ['401', '403'],
    }),
  },
};
