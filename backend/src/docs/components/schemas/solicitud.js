'use strict';
const modelToSchema = require('../../modelToSchema');
const { SolicitudEmpresa, SolicitudReclutador } = require('../../../models');

const reclutadorItem = {
  type: 'object',
  properties: {
    nombre: { type: 'string' },
    apellido: { type: 'string' },
    email: { type: 'string', format: 'email' },
  },
};

module.exports = {
  SolicitudEmpresa: modelToSchema(SolicitudEmpresa),

  // POST /solicitudes-empresa (público).
  SolicitudEmpresaCreate: {
    type: 'object',
    required: [
      'razonSocial', 'cuit', 'rubro', 'email',
      'responsableNombre', 'responsableApellido', 'responsableEmail',
    ],
    properties: {
      razonSocial: { type: 'string' },
      cuit: { type: 'string' },
      rubro: { type: 'string' },
      email: { type: 'string', format: 'email', description: 'Email institucional de contacto.' },
      sitioWeb: { type: 'string' },
      direccion: { type: 'string' },
      ciudad: { type: 'string' },
      telefono: { type: 'string' },
      descripcion: { type: 'string' },
      puestos: { type: 'string' },
      responsableNombre: { type: 'string' },
      responsableApellido: { type: 'string' },
      responsableEmail: { type: 'string', format: 'email' },
      responsableTelefono: { type: 'string' },
      responsableCargo: { type: 'string' },
      carrerasInteres: {
        oneOf: [{ type: 'array', items: { type: 'string' } }, { type: 'string' }],
        description: 'Array o string JSON.',
      },
      reclutadores: {
        type: 'array',
        description: 'Opcional. Cada entrada no vacía requiere nombre, apellido y email.',
        items: reclutadorItem,
      },
    },
  },

  SolicitudReclutador: {
    allOf: [
      modelToSchema(SolicitudReclutador),
      {
        type: 'object',
        properties: {
          empresa: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              razonSocial: { type: 'string' },
              usuarioId: { type: 'integer' },
            },
          },
        },
      },
    ],
  },

  // POST /empresas/equipo/solicitar.
  SolicitudReclutadorCreate: {
    type: 'object',
    required: ['nombre', 'apellido', 'email'],
    properties: {
      nombre: { type: 'string' },
      apellido: { type: 'string' },
      email: { type: 'string', format: 'email' },
    },
  },

  // Body de los PATCH .../rechazar del admin.
  MotivoRechazo: {
    type: 'object',
    description:
      '`motivo` es opcional, pero el body **no puede faltar por completo** en ' +
      '`rechazarSolicitudEmpresa` / `rechazarSolicitudReclutador` (body vacío → 500).',
    properties: { motivo: { type: 'string' } },
  },
};
