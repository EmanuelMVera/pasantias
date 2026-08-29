'use strict';
const modelToSchema = require('../../modelToSchema');
const { Perfil } = require('../../../models');

const CAMPOS_EDITABLES = [
  'carrera', 'anioEgreso', 'descripcion', 'habilidades', 'idiomas', 'certificaciones',
  'linkedin', 'github', 'portfolio', 'redesSociales', 'fotoPerfil', 'areaInteres',
  'disponibilidad', 'preferenciasLaborales', 'salarioPretendido', 'visibilidadPerfil',
  'experienciaLaboral', 'proyectos',
];

module.exports = {
  Perfil: modelToSchema(Perfil),

  // Body de PUT /users/perfil — al menos un campo del allowlist.
  PerfilUpdate: {
    type: 'object',
    description:
      'Se envía al menos uno de estos campos. `telefono` y `ubicacion` también se ' +
      'aceptan y se persisten en el `Usuario`.',
    minProperties: 1,
    properties: {
      ...Object.fromEntries(
        CAMPOS_EDITABLES.map((c) => [c, modelToSchema(Perfil).properties[c] || { }]),
      ),
      telefono: { type: 'string' },
      ubicacion: { type: 'string' },
    },
  },
};
