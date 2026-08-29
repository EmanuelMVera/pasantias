'use strict';
const { operation, ok, paginated, message, REF } = require('../helpers');

const T = 'empresas';
const R_MIEMBRO = ['empresa/admin_empresa', 'empresa/reclutador'];
const R_ADMIN = ['empresa/admin_empresa'];

// respuesta con envelope + `data` + claves sueltas extra (rolEnEquipo, total, ...)
const okWith = (dataSchema, extra = {}, dataIsArray = false) => ({
  description: 'OK',
  content: {
    'application/json': {
      schema: {
        allOf: [
          REF.schema('Envelope'),
          {
            type: 'object',
            required: ['data'],
            properties: {
              data: dataIsArray
                ? { type: 'array', items: dataSchema }
                : dataSchema,
              ...extra,
            },
          },
        ],
      },
    },
  },
});

module.exports = {
  '/api/empresas/dashboard': {
    get: operation({
      tag: T, id: 'empresasDashboard', summary: 'Métricas del panel corporativo',
      roles: R_MIEMBRO,
      responses: { 200: ok('DashboardEmpresa') },
      errors: ['401', '404empresa'],
    }),
  },

  '/api/empresas/mis-ofertas': {
    get: operation({
      tag: T, id: 'empresasMisOfertas', summary: 'Mis ofertas (con conteo de postulaciones)',
      roles: R_MIEMBRO,
      query: ['pageParam', 'limitParam', REF.param('estadoQuery')],
      responses: { 200: paginated('Oferta') },
      errors: ['401', '404empresa'],
    }),
  },

  '/api/empresas/mi-empresa': {
    get: operation({
      tag: T, id: 'empresasMiEmpresa', summary: 'Datos de mi empresa',
      roles: R_MIEMBRO,
      responses: {
        200: okWith(REF.schema('Empresa'), {
          rolEnEquipo: { type: 'string', enum: ['admin_empresa', 'reclutador'] },
        }),
      },
      errors: ['401', '404empresa'],
    }),
    put: operation({
      tag: T, id: 'empresasUpdateMiEmpresa', summary: 'Editar el perfil de mi empresa',
      roles: R_ADMIN, csrf: true, body: 'EmpresaUpdate',
      responses: { 200: ok('Empresa') },
      errors: ['400', '401', '403', '403csrf', '404empresa'],
    }),
  },

  '/api/empresas/mi-empresa/logo': {
    post: operation({
      tag: T, id: 'empresasUploadLogo', summary: 'Subir el logo de mi empresa',
      roles: R_ADMIN, csrf: true,
      body: { type: 'object', required: ['logo'], properties: { logo: { type: 'string', format: 'binary' } } },
      bodyContentType: 'multipart/form-data',
      bodyDescription: 'multipart/form-data con el campo `logo` (imagen validada, máx. 2 MB).',
      responses: { 200: { description: 'OK', content: { 'application/json': { schema: REF.schema('LogoUploadResponse') } } } },
      errors: ['400', '401', '403', '403csrf', '404empresa', '429'],
    }),
  },

  '/api/empresas/candidatos': {
    get: operation({
      tag: T, id: 'empresasCandidatos', summary: 'Todas las postulaciones de mi empresa',
      roles: R_MIEMBRO,
      query: ['pageParam', 'limitParam', REF.param('estadoQuery')],
      responses: {
        200: paginated('Postulacion', {
          extraProps: { conteoPorEstado: { type: 'object', additionalProperties: { type: 'integer' } } },
        }),
      },
      errors: ['401', '404empresa'],
    }),
  },

  '/api/empresas/equipo': {
    get: operation({
      tag: T, id: 'empresasEquipo', summary: 'Miembros del equipo (activos e inactivos)',
      roles: R_MIEMBRO,
      responses: {
        200: okWith(REF.schema('EquipoMiembro'), {
          total: { type: 'integer' },
          rolEnEquipo: { type: 'string', enum: ['admin_empresa', 'reclutador'] },
        }, true),
      },
      errors: ['401', '404empresa'],
    }),
  },

  '/api/empresas/equipo/solicitudes': {
    get: operation({
      tag: T, id: 'empresasEquipoSolicitudes', summary: 'Solicitudes de reclutador de mi empresa',
      roles: R_ADMIN,
      responses: { 200: okWith(REF.schema('SolicitudReclutador'), { total: { type: 'integer' } }, true) },
      errors: ['401', '403', '404empresa'],
    }),
  },

  '/api/empresas/equipo/solicitar': {
    post: operation({
      tag: T, id: 'empresasEquipoSolicitar', summary: 'Solicitar el alta de un reclutador',
      description: 'Crea una `SolicitudReclutador` pendiente; el **admin del instituto** crea la cuenta al aprobar.',
      roles: R_ADMIN, csrf: true, body: 'SolicitudReclutadorCreate',
      responses: { 201: message({ data: REF.schema('SolicitudReclutador') }, { code: 201 }) },
      errors: ['400', '401', '403', '403csrf', '404empresa'],
    }),
  },

  '/api/empresas/equipo/{id}/recuperacion': {
    post: operation({
      tag: T, id: 'empresasEquipoRecuperacion', summary: 'Enviar recuperación de acceso a un miembro',
      description: 'Manda un email al miembro para que fije su contraseña. El admin_empresa nunca ve ni elige la contraseña.',
      roles: R_ADMIN, csrf: true, params: ['id'],
      responses: { 200: message() },
      errors: ['401', '403', '403csrf', '404', '404empresa'],
    }),
  },

  '/api/empresas/equipo/{id}': {
    patch: operation({
      tag: T, id: 'empresasEquipoUpdate', summary: 'Cambiar rol o estado de un miembro',
      roles: R_ADMIN, csrf: true, params: ['id'],
      body: {
        type: 'object',
        properties: {
          rolInterno: { type: 'string', enum: ['reclutador'], description: 'Solo se puede asignar `reclutador`.' },
          activo: { type: 'boolean' },
        },
      },
      responses: { 200: message({ data: REF.schema('EquipoMiembro') }) },
      errors: ['400', '401', '403', '403csrf', '404', '404empresa'],
    }),
    delete: operation({
      tag: T, id: 'empresasEquipoRemove', summary: 'Dar de baja un miembro del equipo',
      roles: R_ADMIN, csrf: true, params: ['id'],
      responses: { 200: message() },
      errors: ['401', '403', '403csrf', '404', '404empresa'],
    }),
  },

  '/api/empresas/{id}': {
    get: operation({
      tag: T, id: 'empresasGetPublica', summary: 'Perfil público de una empresa',
      description: 'Cualquier usuario autenticado. Solo empresas `aprobada`; incluye sus últimas ofertas activas.',
      params: ['id'],
      responses: { 200: ok('EmpresaPublica') },
      errors: ['401', '404'],
    }),
  },
};
