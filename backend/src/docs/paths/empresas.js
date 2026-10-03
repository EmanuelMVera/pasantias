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
      description: 'La respuesta depende de quién consulta (`alcance`). **admin_empresa** → `alcance: "empresa"`: métricas de toda la empresa (reclutadores activos, solicitudes pendientes, top de ofertas y ofertas recientes con su responsable). **reclutador** → `alcance: "reclutador"`: panel PERSONAL, solo de las ofertas a su cargo (`ofertas`, `postulaciones`, `procesosActivos` — máx. 5 — y `paraAtender`: pendientes derivados del estado actual); no incluye `equipo`, `topOfertasPostulaciones` ni `ofertasRecientes`.',
      roles: R_MIEMBRO,
      responses: { 200: ok('DashboardEmpresa') },
      errors: ['401', '404empresa'],
    }),
  },

  '/api/empresas/mis-ofertas': {
    get: operation({
      tag: T, id: 'empresasMisOfertas', summary: 'Ofertas de mi empresa (con responsable y conteo de postulaciones)',
      description: 'Alcance obligatorio según el actor: el admin_empresa recibe todas las ofertas de la empresa; el **reclutador solo las que tiene a su cargo** (el filtro `responsable` se ignora para él: no sirve para ampliar el alcance). Los filtros se aplican en el servidor, dentro de ese alcance y antes de paginar. Valores inválidos se ignoran.',
      roles: R_MIEMBRO,
      query: [
        'pageParam', 'limitParam', REF.param('estadoQuery'), REF.param('estadoModeracionQuery'),
        { name: 'responsable', in: 'query', description: 'Id del usuario responsable de la oferta, o `sin` para las ofertas sin responsable.', schema: { type: 'string' } },
        { name: 'q', in: 'query', description: 'Texto en título, área o nombre/apellido del responsable.', schema: { type: 'string', maxLength: 100 } },
      ],
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

  '/api/empresas/ofertas/{id}': {
    get: operation({
      tag: T, id: 'empresasOfertaDetalle', summary: 'Detalle completo de una oferta de mi empresa',
      description: 'Devuelve la oferta en cualquier estado (el detalle público `GET /api/ofertas/{id}` solo devuelve las visibles para alumnos). El reclutador solo la obtiene si es el responsable (404 si no, incluidas las ofertas sin responsable); el admin_empresa, cualquiera de su empresa.',
      roles: R_MIEMBRO, params: ['id'],
      responses: { 200: ok('Oferta') },
      errors: ['401', '404', '404empresa'],
    }),
  },

  '/api/empresas/ofertas/{id}/responsable': {
    patch: operation({
      tag: T, id: 'empresasOfertaResponsable', summary: 'Asignar o cambiar el reclutador responsable de una oferta',
      description: 'Acción de gobierno del admin_empresa: solo cambia el responsable (`creadaPorUsuarioId`). No edita el contenido de la oferta ni sus postulaciones. El responsable debe ser un reclutador activo de la misma empresa (400 si es el admin_empresa, está suspendido, es de otra empresa o ya es el responsable). Notifica al nuevo responsable y, si sigue activo, al anterior. Audita `asignar_responsable_oferta` / `reasignar_responsable_oferta`.',
      roles: R_ADMIN, csrf: true, params: ['id'],
      body: {
        type: 'object',
        required: ['responsableId'],
        properties: {
          responsableId: { type: 'integer', minimum: 1, description: 'Id de usuario de un reclutador activo de la empresa.' },
        },
      },
      responses: {
        200: message({
          data: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              titulo: { type: 'string' },
              creadaPorUsuarioId: { type: 'integer' },
              creadaPor: REF.schema('ResponsableOferta'),
              responsableAnterior: REF.schema('ResponsableOferta'),
            },
          },
        }),
      },
      errors: ['400', '401', '403', '403csrf', '404', '404empresa'],
    }),
  },

  '/api/empresas/reclutadores/{id}/perfil': {
    get: operation({
      tag: T, id: 'empresasReclutadorPerfil', summary: 'Ficha de contacto de un reclutador',
      description: 'Solo lectura. `id` es el id de usuario. Pueden verla: el propio reclutador, los miembros activos de su empresa, un alumno/egresado que pueda ver la conversación de chat con él, y el admin del sistema. Responde el mismo 404 si el usuario no existe, no es un reclutador activo (p. ej. es admin_empresa) o quien consulta no tiene relación: no permite enumerar reclutadores.',
      params: ['id'],
      responses: { 200: ok('ReclutadorPerfil') },
      errors: ['401', '404'],
    }),
  },

  '/api/empresas/candidatos': {
    get: operation({
      tag: T, id: 'empresasCandidatos', summary: 'Todas las postulaciones de mi empresa',
      description: 'Alcance obligatorio según el actor: el admin_empresa recibe las postulaciones de toda la empresa; el **reclutador solo las de las ofertas a su cargo** (`responsable` se ignora para él). Cada postulación incluye la oferta y su responsable (`oferta.creadaPor`). `conteoPorEstado` se calcula sobre el alcance filtrado por responsable/oferta/q (sin el filtro de estado).',
      roles: R_MIEMBRO,
      query: [
        'pageParam', 'limitParam', REF.param('estadoQuery'),
        { name: 'responsable', in: 'query', description: 'Id del usuario responsable de la oferta, o `sin` para las ofertas sin responsable.', schema: { type: 'string' } },
        { name: 'ofertaId', in: 'query', description: 'Solo las postulaciones de esa oferta de la empresa.', schema: { type: 'integer', minimum: 1 } },
        { name: 'q', in: 'query', description: 'Texto en nombre, apellido o email del candidato (dentro del alcance del actor).', schema: { type: 'string', maxLength: 100 } },
      ],
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
