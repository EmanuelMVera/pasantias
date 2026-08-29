'use strict';
const modelToSchema = require('../../modelToSchema');
const { Postulacion } = require('../../../models');

const ESTADOS = ['en_revision', 'preseleccionado', 'entrevista', 'contratado', 'rechazado'];

module.exports = {
  Postulacion: {
    allOf: [
      modelToSchema(Postulacion),
      {
        type: 'object',
        description: '`formatearPostulacion` agrega alias sobre los campos del modelo.',
        properties: {
          estadoActual: { type: 'string', enum: ESTADOS, description: 'Alias de `estado`.' },
          ultimaActualizacion: { type: 'string', format: 'date-time' },
          observacionesEmpresa: { type: ['string', 'null'], description: 'Alias de `notasEmpresa`.' },
          oferta: { $ref: '#/components/schemas/OfertaResumen' },
          usuario: { $ref: '#/components/schemas/UsuarioResumen' },
        },
      },
    ],
  },

  PostulacionCreate: {
    type: 'object',
    required: ['ofertaId'],
    properties: {
      ofertaId: { type: 'integer' },
      cartaPresentacion: { type: 'string', description: 'Opcional.' },
    },
  },

  PostulacionEstadoUpdate: {
    type: 'object',
    description: 'Ambos campos son opcionales; sin ninguno, la operación es un no-op y responde 200.',
    properties: {
      estado: { type: 'string', enum: ESTADOS },
      notasEmpresa: { type: 'string' },
    },
  },
};
