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
    description:
      '`aprobar`/`rechazar` tocan `estadoModeracion` (revisión institucional). ' +
      '`pausar`/`cerrar` tocan `estado` (ciclo de vida de la publicación) — nunca se mezclan en la misma escritura.',
    properties: {
      accion: { type: 'string', enum: ['aprobar', 'rechazar', 'pausar', 'cerrar'] },
      aprobada: { type: 'boolean', deprecated: true, description: 'Fallback legacy de `accion` (aprobar/rechazar).' },
    },
  },

  AdminCambiarConfianzaEmpresa: {
    type: 'object',
    required: ['accion'],
    description: 'Cambia el nivel de confianza institucional de una empresa (RBAC-05). Reversible en cualquier momento; no re-modera retroactivamente lo ya publicado.',
    properties: {
      accion: { type: 'string', enum: ['marcar', 'revocar'], description: '`marcar` → confiable, `revocar` → estandar.' },
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
          solicitudesPendientes: { type: 'integer', description: 'Solicitudes de registro de empresa que esperan decisión del admin (SolicitudEmpresa.estado = pendiente). Es el número a mostrar como "pendientes": `pendientes` cuenta filas Empresa, que se crean recién al aprobar.' },
          reclutadoresActivos: { type: 'integer' },
          tiempoPromedioAprobacionDias: { type: ['number', 'null'], description: 'Histórico: promedio de días entre el envío de la solicitud de empresa y su aprobación (SolicitudEmpresa.revisadaEn − createdAt). `null` si todavía no se aprobó ninguna.' },
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
      contrataciones: {
        type: 'object',
        properties: {
          total: { type: 'integer', description: 'Postulaciones que hoy figuran como contratadas (histórico).' },
          enPeriodo: { type: 'integer', description: 'Postulaciones distintas que pasaron a "contratado" DENTRO del período (según el historial de estados), sin importar cuándo se postularon.' },
          tasaContratacion: { type: ['number', 'null'] },
        },
      },
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

  ReclutadorPerfil: {
    type: 'object',
    description: 'Ficha de contacto de un reclutador activo.',
    properties: {
      id: { type: 'integer' },
      nombre: { type: 'string' },
      apellido: { type: 'string' },
      email: { type: 'string', format: 'email' },
      telefono: { type: 'string', nullable: true },
      ubicacion: { type: 'string', nullable: true },
      fotoPerfil: { type: 'string', nullable: true },
      empresa: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          razonSocial: { type: 'string' },
          logo: { type: 'string', nullable: true },
        },
      },
    },
  },

  ResponsableOferta: {
    type: 'object',
    nullable: true,
    description: 'Reclutador responsable de la oferta. null en ofertas históricas sin responsable.',
    properties: {
      id: { type: 'integer' },
      nombre: { type: 'string' },
      apellido: { type: 'string' },
    },
  },

  DashboardReclutador: {
    type: 'object',
    description: 'Panel personal del reclutador (`alcance: "reclutador"` en GET /api/empresas/dashboard): solo ofertas a su cargo.',
    properties: {
      alcance: { type: 'string', enum: ['reclutador'] },
      ofertas: {
        type: 'object',
        properties: {
          activas: { type: 'integer' }, pausadas: { type: 'integer' }, cerradas: { type: 'integer' },
          pendienteModeracion: { type: 'integer' }, rechazadas: { type: 'integer' }, total: { type: 'integer' },
        },
      },
      postulaciones: {
        type: 'object',
        properties: {
          total: { type: 'integer' }, enRevision: { type: 'integer' }, preseleccionados: { type: 'integer' },
          entrevistas: { type: 'integer' }, contrataciones: { type: 'integer' },
        },
      },
      procesosActivos: {
        type: 'array',
        description: 'Hasta 5 ofertas no cerradas, primero las que tienen candidatos esperando revisión.',
        items: {
          type: 'object',
          properties: {
            oferta: {
              type: 'object',
              properties: {
                id: { type: 'integer' }, titulo: { type: 'string' },
                estado: { type: 'string', enum: ['activa', 'pausada', 'cerrada'] },
                estadoModeracion: { type: 'string', enum: ['pendiente', 'aprobada', 'rechazada', 'auto_aprobada'] },
                fechaLimite: { type: 'string', format: 'date-time', nullable: true },
              },
            },
            totalCandidatos: { type: 'integer' },
            porEstado: {
              type: 'object',
              properties: {
                enRevision: { type: 'integer' }, preseleccionados: { type: 'integer' }, entrevistas: { type: 'integer' },
                contratados: { type: 'integer' }, rechazados: { type: 'integer' },
              },
            },
          },
        },
      },
      paraAtender: {
        type: 'array',
        description: 'Pendientes derivados del estado actual (no hay tabla de tareas). Sin ítems en cero.',
        items: {
          type: 'object',
          properties: {
            tipo: { type: 'string', enum: ['oferta_rechazada', 'candidatos_en_revision', 'candidatos_en_entrevista', 'cierre_proximo', 'oferta_pendiente_moderacion'] },
            ofertaId: { type: 'integer' },
            titulo: { type: 'string' },
            cantidad: { type: 'integer', description: 'Solo en los tipos de candidatos.' },
            dias: { type: 'integer', description: 'Solo en `cierre_proximo`: días hasta la fecha límite (0–7).' },
            fechaLimite: { type: 'string', format: 'date-time' },
          },
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
      equipo: {
        type: 'object',
        properties: {
          totalMiembros: { type: 'integer', description: 'Membresías activas (incluye al admin_empresa).' },
          reclutadoresActivos: { type: 'integer', description: 'Solo reclutadores con membresía activa.' },
          solicitudesPendientes: { type: 'integer', description: 'Solicitudes de reclutador pendientes de aprobación.' },
        },
      },
      ofertasRecientes: {
        type: 'array',
        description: 'Las 5 ofertas más recientes de la empresa.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            titulo: { type: 'string' },
            area: { type: 'string', nullable: true },
            estado: { type: 'string', enum: ['activa', 'pausada', 'cerrada'] },
            estadoModeracion: { type: 'string', enum: ['pendiente', 'aprobada', 'rechazada', 'auto_aprobada'] },
            vistas: { type: 'integer' },
            cantidadVacantes: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            creadaPorUsuarioId: { type: 'integer', nullable: true },
            creadaPor: { $ref: '#/components/schemas/ResponsableOferta' },
            totalPostulaciones: { type: 'integer' },
          },
        },
      },
      topOfertasPostulaciones: {
        type: 'array',
        description: 'Hasta 5 ofertas con al menos una postulación, ordenadas por cantidad (top global de la empresa).',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            titulo: { type: 'string' },
            estado: { type: 'string', enum: ['activa', 'pausada', 'cerrada'] },
            totalPostulaciones: { type: 'integer' },
            creadaPor: { $ref: '#/components/schemas/ResponsableOferta' },
          },
        },
      },
    },
  },

  DashboardAlumno: {
    type: 'object',
    description: 'Métricas personales, ofertas recomendadas, % de completitud del perfil y `cvCargado` (sin CV no se puede postular).',
    additionalProperties: true,
  },

  EquipoMiembro: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      rolInterno: { type: 'string', enum: ['admin_empresa', 'reclutador'] },
      activo: { type: 'boolean' },
      usuario: { $ref: '#/components/schemas/UsuarioResumen' },
    },
  },
};
