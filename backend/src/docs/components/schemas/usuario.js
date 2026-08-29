'use strict';
const modelToSchema = require('../../modelToSchema');
const { Usuario } = require('../../../models');

// NUNCA exponer estos campos.
const SENSIBLES = ['password', 'tokenReset', 'tokenResetExpira', 'tokenResetUsadoEn', 'tokenVersion'];

const base = modelToSchema(Usuario, { exclude: [...SENSIBLES, 'deletedAt'] });

module.exports = {
  // Usuario completo tal como lo devuelve `GET /auth/me` y el panel admin
  // (Sequelize row menos campos sensibles).
  Usuario: base,

  // Forma reducida que devuelve el login y algunos listados.
  UsuarioResumen: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      nombre: { type: 'string' },
      apellido: { type: 'string' },
      email: { type: 'string', format: 'email' },
      rol: { type: 'string', enum: ['alumno', 'egresado', 'empresa', 'admin'] },
      telefono: { type: ['string', 'null'] },
      ubicacion: { type: ['string', 'null'] },
      fotoPerfil: { type: ['string', 'null'] },
    },
  },
};
