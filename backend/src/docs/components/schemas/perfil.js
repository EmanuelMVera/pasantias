'use strict';
const modelToSchema = require('../../modelToSchema');
const { Perfil } = require('../../../models');

// Sin carrera/anioEgreso/legajo: son institucionales (400 si se envían).
const CAMPOS_EDITABLES = [
  'descripcion', 'habilidades', 'idiomas', 'certificaciones',
  'linkedin', 'github', 'portfolio', 'redesSociales', 'areaInteres',
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
      'aceptan y se persisten en el `Usuario`. Los datos institucionales (carrera, anioEgreso, ' +
      'legajo, rol, nombre, apellido, email) se rechazan con 400.',
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
