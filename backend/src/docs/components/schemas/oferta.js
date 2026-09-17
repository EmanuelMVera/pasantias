'use strict';
const modelToSchema = require('../../modelToSchema');
const { Oferta } = require('../../../models');

const full = modelToSchema(Oferta, { exclude: ['deletedAt'] });

// Campos que NO se aceptan en el body de creación/edición (los fija el server).
// creadaPorUsuarioId: sale exclusivamente de req.usuario.id — un valor enviado
// en el body se ignora silenciosamente (RBAC-01, ver tests/oferta.test.js).
const NO_INPUT = ['id', 'empresaId', 'moderada', 'vistas', 'estado', 'nivelExperiencia',
  'creadaPorUsuarioId', 'createdAt', 'updatedAt', 'deletedAt'];
const inputProps = Object.fromEntries(
  Object.entries(full.properties).filter(([k]) => !NO_INPUT.includes(k)),
);

module.exports = {
  Oferta: {
    allOf: [
      full,
      { type: 'object', properties: { empresa: { $ref: '#/components/schemas/EmpresaResumen' } } },
    ],
  },

  OfertaResumen: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      titulo: { type: 'string' },
      area: { type: ['string', 'null'] },
      modalidad: { type: 'string' },
      ciudad: { type: ['string', 'null'] },
      tipoPuesto: { type: ['string', 'null'] },
      fechaLimite: { type: ['string', 'null'], format: 'date-time' },
    },
  },

  OfertaCreate: {
    type: 'object',
    required: ['titulo', 'descripcion'],
    description:
      'Omitir `titulo` o `descripcion` provoca un **500** (los valida Sequelize, no un guard). ' +
      '`salario`, `fechaPublicacion` y `fechaLimite` en `""` se guardan como `null`.',
    properties: inputProps,
  },

  OfertaUpdate: {
    type: 'object',
    description: 'Mismos campos que `OfertaCreate`; se envían solo los que cambian.',
    properties: inputProps,
  },
};
