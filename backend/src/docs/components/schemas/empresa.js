'use strict';
const modelToSchema = require('../../modelToSchema');
const { Empresa } = require('../../../models');

module.exports = {
  Empresa: modelToSchema(Empresa, { exclude: ['deletedAt'] }),

  // Lo que se anida en una oferta o listado (subconjunto público).
  EmpresaResumen: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      razonSocial: { type: 'string' },
      logo: { type: ['string', 'null'] },
      rubro: { type: ['string', 'null'] },
      ciudad: { type: ['string', 'null'] },
    },
  },

  // GET /empresas/{id} — perfil público + últimas ofertas activas.
  EmpresaPublica: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      razonSocial: { type: 'string' },
      rubro: { type: ['string', 'null'] },
      descripcion: { type: ['string', 'null'] },
      ciudad: { type: ['string', 'null'] },
      direccion: { type: ['string', 'null'] },
      telefono: { type: ['string', 'null'] },
      sitioWeb: { type: ['string', 'null'] },
      logo: { type: ['string', 'null'] },
      usuarioId: { type: 'integer' },
      ofertas: { type: 'array', items: { $ref: '#/components/schemas/OfertaResumen' } },
    },
  },

  // Body de PUT /empresas/mi-empresa (solo estos campos se persisten).
  EmpresaUpdate: {
    type: 'object',
    minProperties: 1,
    properties: {
      descripcion: { type: 'string' },
      rubro: { type: 'string' },
      sitioWeb: { type: 'string', format: 'uri' },
      telefono: { type: 'string' },
      direccion: { type: 'string' },
      ciudad: { type: 'string' },
    },
  },
};
