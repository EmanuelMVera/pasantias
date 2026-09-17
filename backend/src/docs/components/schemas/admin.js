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

  EstadisticasGenerales: {
    type: 'object',
    description: 'Estadísticas profesionales del sistema — sección 12 de la iteración funcional/visual. Todas las métricas salen de modelos existentes (ninguna se inventa); toda tasa/porcentaje es `null` (no 0%) cuando el denominador es 0.',
    properties: {
      periodo: { type: 'object', properties: { desde: { type: 'string', format: 'date-time' }, hasta: { type: 'string', format: 'date-time' } } },
      usuarios: { type: 'object', properties: { totalActivos: { type: 'integer' }, alumnos: { type: 'integer' }, egresados: { type: 'integer' }, altasEnPeriodo: { type: 'integer' } } },
      empresas: {
        type: 'object',
        properties: {
          aprobadas: { type: 'integer' }, pendientes: { type: 'integer' }, rechazadas: { type: 'integer' },
          reclutadoresActivos: { type: 'integer' },
          tiempoPromedioAprobacionDias: { type: ['number', 'null'] },
          conMasOfertas: { type: 'array', items: { type: 'object', properties: { empresaId: { type: 'integer' }, razonSocial: { type: 'string' }, totalOfertas: { type: 'integer' } } } },
        },
      },
      ofertas: {
        type: 'object',
        properties: {
          activas: { type: 'integer' }, pausadas: { type: 'integer' }, cerradas: { type: 'integer' }, rechazadas: { type: 'integer' },
          pendienteModeracion: { type: 'integer' },
          porArea: { type: 'object', additionalProperties: { type: 'integer' } },
        },
      },
      postulaciones: { type: 'object', properties: { total: { type: 'integer' }, enPeriodo: { type: 'integer' } } },
      contrataciones: { type: 'object', properties: { total: { type: 'integer' }, enPeriodo: { type: 'integer' }, tasaContratacion: { type: ['number', 'null'] } } },
      embudo: {
        type: 'object',
        properties: {
          enRevision: { type: 'integer' }, preseleccionado: { type: 'integer' }, entrevista: { type: 'integer' }, contratado: { type: 'integer' },
          tasaEntrevistaAPreseleccion: { type: ['number', 'null'] },
          tasaPreseleccionARevision: { type: ['number', 'null'] },
          tasaContratadoAEntrevista: { type: ['number', 'null'] },
        },
      },
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
