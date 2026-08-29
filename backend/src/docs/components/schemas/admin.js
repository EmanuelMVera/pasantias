'use strict';

// Schemas específicos del panel de administración.
module.exports = {
  AdminUsuarioCreate: {
    type: 'object',
    required: ['nombre', 'apellido', 'email', 'password', 'rol'],
    properties: {
      nombre: { type: 'string' },
      apellido: { type: 'string' },
      email: { type: 'string', format: 'email' },
      password: { type: 'string' },
      rol: { type: 'string', enum: ['alumno', 'egresado', 'empresa', 'admin'] },
      telefono: { type: 'string' },
      ubicacion: { type: 'string' },
      legajo: { type: 'string', description: 'Obligatorio si `rol` es `alumno` o `egresado`.' },
    },
  },

  AdminUsuarioUpdate: {
    type: 'object',
    description: 'Todos opcionales; se ignoran los `undefined`.',
    properties: {
      nombre: { type: 'string' },
      apellido: { type: 'string' },
      email: { type: 'string', format: 'email' },
      rol: { type: 'string', enum: ['alumno', 'egresado', 'empresa', 'admin'] },
      activo: { type: 'boolean' },
      telefono: { type: 'string' },
      ubicacion: { type: 'string' },
      password: { type: 'string' },
      legajo: { type: 'string' },
    },
  },

  AdminModerarOferta: {
    type: 'object',
    required: ['accion'],
    properties: {
      accion: { type: 'string', enum: ['aprobar', 'pausar', 'rechazar', 'cerrar'] },
      aprobada: { type: 'boolean', deprecated: true, description: 'Fallback legacy de `accion`.' },
    },
  },

  DashboardGeneral: {
    type: 'object',
    properties: {
      usuarios: { type: 'object', additionalProperties: { type: 'integer' } },
      pasantias: { type: 'object', additionalProperties: { type: 'number' } },
      sistema: { type: 'object', additionalProperties: { type: 'integer' } },
      actividadReciente: { type: 'array', items: { $ref: '#/components/schemas/ActivityLog' } },
    },
  },

  DashboardEmpresa: {
    type: 'object',
    properties: {
      empresa: { $ref: '#/components/schemas/EmpresaResumen' },
      rolEnEquipo: { type: 'string', enum: ['admin_empresa', 'reclutador'] },
      ofertas: { type: 'object', additionalProperties: { type: 'integer' } },
      postulaciones: { type: 'object', additionalProperties: { type: 'integer' } },
      equipo: { type: 'object', properties: { totalMiembros: { type: 'integer' } } },
      ofertasRecientes: { type: 'array', items: { $ref: '#/components/schemas/OfertaResumen' } },
    },
  },

  DashboardAlumno: {
    type: 'object',
    description: 'Métricas personales, ofertas recomendadas y % de completitud del perfil.',
    additionalProperties: true,
  },

  EquipoMiembro: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      rolInterno: { type: 'string', enum: ['admin_empresa', 'reclutador'] },
      activo: { type: 'boolean' },
      esAdminVirtual: { type: 'boolean', description: 'true = dueño directo sin fila en empresa_usuarios.' },
      usuario: { $ref: '#/components/schemas/UsuarioResumen' },
    },
  },
};
