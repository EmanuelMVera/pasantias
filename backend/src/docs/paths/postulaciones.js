'use strict';
const { operation, paginated, message, REF } = require('../helpers');

const T = 'postulaciones';

module.exports = {
  '/api/postulaciones': {
    post: operation({
      tag: T, id: 'postulacionesCrear', summary: 'Postularme a una oferta',
      description: 'Requiere tener un CV subido. El CV se snapshotea en la postulación.',
      roles: ['alumno', 'egresado'], csrf: true, body: 'PostulacionCreate',
      responses: { 201: message({ data: REF.schema('Postulacion') }, { code: 201 }) },
      errors: ['400', '401', '403', '403csrf', '404', '429'],
    }),
  },

  '/api/postulaciones/mis': {
    get: operation({
      tag: T, id: 'postulacionesMias', summary: 'Mis postulaciones',
      description: '`?estado=` filtra por un estado real. `?grupo=en_proceso` (gana sobre `estado`) agrupa en_revision + preseleccionado: es una agrupación de presentación del KPI "En proceso", no un estado de la BD. Grupo desconocido → 400.',
      roles: ['alumno', 'egresado'],
      query: ['pageParam', 'limitParam', REF.param('estadoQuery'), {
        name: 'grupo', in: 'query', required: false,
        description: 'Agrupación de estados de presentación.', schema: { type: 'string', enum: ['en_proceso'] },
      }],
      responses: {
        200: paginated('Postulacion', {
          extraProps: { conteoPorEstado: { type: 'object', additionalProperties: { type: 'integer' } } },
        }),
      },
      errors: ['401', '403'],
    }),
  },

  '/api/postulaciones/oferta/{ofertaId}': {
    get: operation({
      tag: T, id: 'postulacionesByOferta', summary: 'Candidatos de una oferta de mi empresa',
      description: 'Proceso de selección de una oferta. El **reclutador solo accede si es el responsable** (403 `NO_ES_RESPONSABLE` si la oferta es de otro reclutador o no tiene responsable asignado); el admin_empresa supervisa cualquiera de su empresa (`puedeGestionar: false`). Cada postulación trae `transicionesPermitidas` (vacío para quien solo supervisa) y la nota interna `notasEmpresa`.',
      roles: ['empresa/admin_empresa', 'empresa/reclutador'],
      params: [{ name: 'ofertaId', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }],
      query: ['pageParam', 'limitParam', REF.param('estadoQuery')],
      responses: {
        200: paginated('Postulacion', {
          extraProps: {
            conteoPorEstado: { type: 'object', additionalProperties: { type: 'integer' } },
            oferta: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                titulo: { type: 'string' },
                habilidadesRequeridas: { type: 'array', items: { type: 'string' } },
                estado: { type: 'string', enum: ['activa', 'pausada', 'cerrada'] },
                estadoModeracion: { type: 'string', enum: ['pendiente', 'aprobada', 'rechazada', 'auto_aprobada'] },
                fechaLimite: { type: 'string', format: 'date-time', nullable: true },
                creadaPorUsuarioId: { type: 'integer', nullable: true },
                creadaPor: REF.schema('ResponsableOferta'),
              },
            },
            puedeGestionar: { type: 'boolean', description: 'true solo para el reclutador responsable.' },
          },
        }),
      },
      errors: ['401', '403', '404'],
    }),
  },

  '/api/postulaciones/{id}/historial': {
    get: operation({
      tag: T, id: 'postulacionesHistorial', summary: 'Historial de estados de una postulación',
      description: 'Línea de tiempo del proceso (quién y cuándo cambió cada estado). Para el reclutador responsable de la oferta y el admin_empresa de esa empresa. No incluye notas internas.',
      roles: ['empresa/admin_empresa', 'empresa/reclutador'],
      params: ['id'],
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  estadoActual: { type: 'string' },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer' },
                        estadoAnterior: { type: 'string', nullable: true },
                        estadoNuevo: { type: 'string' },
                        createdAt: { type: 'string', format: 'date-time' },
                        cambiadoPor: {
                          type: 'object',
                          nullable: true,
                          properties: {
                            id: { type: 'integer' }, nombre: { type: 'string' }, apellido: { type: 'string' }, rol: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      errors: ['401', '403', '404'],
    }),
  },

  '/api/postulaciones/{id}/estado': {
    patch: operation({
      tag: T, id: 'postulacionesUpdateEstado', summary: 'Cambiar el estado de una postulación',
      description: 'Solo el reclutador responsable de la oferta (403 `NO_ES_RESPONSABLE` en cualquier otro caso, incluidas las ofertas sin responsable). El admin_empresa supervisa pero no gestiona candidatos (403 `ROL_INSUFICIENTE`). Flujo guiado: en_revision → preseleccionado | rechazado; preseleccionado → entrevista | rechazado | en_revision; entrevista → contratado | rechazado | preseleccionado; rechazado → en_revision; contratado es final. Una transición no permitida responde 400 `TRANSICION_NO_PERMITIDA` con `transicionesPermitidas`. También guarda la nota interna.',
      roles: ['empresa/reclutador'],
      csrf: true, params: ['id'], body: 'PostulacionEstadoUpdate',
      responses: { 200: message({ data: REF.schema('Postulacion') }) },
      errors: ['400', '401', '403', '403csrf', '404'],
    }),
  },
};
