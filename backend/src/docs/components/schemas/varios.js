'use strict';
const modelToSchema = require('../../modelToSchema');
const { Notificacion, Mensaje, ActivityLog } = require('../../../models');

module.exports = {
  Notificacion: modelToSchema(Notificacion),

  Mensaje: modelToSchema(Mensaje),
  MensajeCreate: {
    type: 'object',
    required: ['receptorId', 'mensaje'],
    properties: {
      receptorId: { type: 'integer' },
      mensaje: { type: 'string', maxLength: 2000 },
    },
  },

  Conversacion: {
    type: 'object',
    properties: {
      usuario: { $ref: '#/components/schemas/UsuarioResumen' },
      ultimoMensaje: { $ref: '#/components/schemas/Mensaje' },
      noLeidos: { type: 'integer' },
    },
  },

  ActivityLog: {
    allOf: [
      modelToSchema(ActivityLog),
      { type: 'object', properties: { usuario: { $ref: '#/components/schemas/UsuarioResumen' } } },
    ],
  },
};
