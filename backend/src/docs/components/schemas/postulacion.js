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
    description: 'Al menos uno de los dos campos (400 si no viene ninguno). Con solo `notasEmpresa` se guarda la nota interna sin cambiar el estado ni notificar al candidato.',
    properties: {
      estado: { type: 'string', enum: ESTADOS, description: 'Tiene que ser una transición permitida desde el estado actual (flujo guiado).' },
      notasEmpresa: { type: 'string', nullable: true, maxLength: 2000, description: 'Nota interna de la empresa. Nunca se le muestra al candidato. Vacío o null la borra.' },
    },
  },
};
