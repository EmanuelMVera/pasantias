'use strict';
const { operation, ok, paginated, message, okRaw, file, REF } = require('../helpers');

const T = 'admin';
const ROLES = ['admin'];

// operation() con tag=admin y roles=admin preseteados; `err` extiende los
// errores base (401, 403; + 403csrf si `csrf`).
function adminOp(cfg) {
  const base = ['401', '403'];
  if (cfg.csrf) base.push('403csrf');
  return operation({
    tag: T, roles: ROLES, ...cfg,
    errors: [...base, ...(cfg.errors || [])],
  });
}

// lista NO paginada: { success, data: [item] }
const listaSimple = (itemRef) => ({
  description: 'OK',
  content: {
    'application/json': {
      schema: {
        allOf: [
          REF.schema('Envelope'),
          { type: 'object', required: ['data'], properties: { data: { type: 'array', items: itemRef } } },
        ],
      },
    },
  },
});

const logFilters = [
  { name: 'accion', in: 'query', schema: { type: 'string' } },
  { name: 'usuarioId', in: 'query', schema: { type: 'integer' } },
  { name: 'entidad', in: 'query', schema: { type: 'string' } },
  { name: 'desde', in: 'query', schema: { type: 'string', format: 'date' } },
  { name: 'hasta', in: 'query', schema: { type: 'string', format: 'date' } },
];

module.exports = {
  // ── Dashboard ──────────────────────────────────────────────────────────────
  '/api/admin/dashboard-general': {
    get: adminOp({ id: 'adminDashboardGeneral', summary: 'Métricas globales del instituto',
      responses: { 200: ok('DashboardGeneral') } }),
  },
  '/api/admin/stats': {
    get: adminOp({ id: 'adminStats', summary: 'Stats resumidas (legacy)', deprecated: true,
      responses: { 200: ok('DashboardGeneral') } }),
  },
  '/api/admin/actividad-reciente': {
    get: adminOp({ id: 'adminActividadReciente', summary: 'Últimas 20 acciones registradas',
      responses: { 200: listaSimple(REF.schema('ActivityLog')) } }),
  },

  // ── Usuarios ───────────────────────────────────────────────────────────────
  '/api/admin/usuarios': {
    get: adminOp({ id: 'adminUsuariosList', summary: 'Listar usuarios',
      query: ['pageParam', 'limitParam',
        { name: 'rol', in: 'query', schema: { type: 'string', enum: ['alumno', 'egresado', 'empresa', 'admin'] } },
        { name: 'activo', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        REF.param('qQuery')],
      responses: { 200: paginated('Usuario') } }),
    post: adminOp({ id: 'adminUsuariosCrear', summary: 'Crear un usuario', csrf: true,
      body: 'AdminUsuarioCreate', errors: ['400'],
      responses: { 201: message({ data: REF.schema('Usuario') }, { code: 201 }) } }),
  },
  '/api/admin/usuarios/{id}': {
    get: adminOp({ id: 'adminUsuariosGet', summary: 'Detalle de un usuario', params: ['id'],
      errors: ['404'], responses: { 200: ok('Usuario') } }),
    put: adminOp({ id: 'adminUsuariosUpdate', summary: 'Editar un usuario', csrf: true, params: ['id'],
      body: 'AdminUsuarioUpdate', errors: ['400', '404'],
      responses: { 200: message({ data: REF.schema('Usuario') }) } }),
    delete: adminOp({ id: 'adminUsuariosEliminar', summary: 'Desactivar un usuario (soft delete)',
      csrf: true, params: ['id'], errors: ['404'], responses: { 200: message() } }),
  },
  '/api/admin/usuarios/{id}/toggle': {
    patch: adminOp({ id: 'adminUsuariosToggle', summary: 'Activar / desactivar un usuario',
      csrf: true, params: ['id'], errors: ['404'], responses: { 200: message() } }),
  },

  // ── Empresas (moderación) ──────────────────────────────────────────────────
  '/api/admin/empresas/pendientes': {
    get: adminOp({ id: 'adminEmpresasPendientes', summary: 'Empresas pendientes de aprobación',
      responses: { 200: listaSimple(REF.schema('Empresa')) } }),
  },
  '/api/admin/empresas/{id}/aprobar': {
    patch: adminOp({ id: 'adminEmpresasAprobar', summary: 'Aprobar una empresa',
      csrf: true, params: ['id'], errors: ['404'], responses: { 200: message() } }),
  },
  '/api/admin/empresas/{id}/rechazar': {
    patch: adminOp({ id: 'adminEmpresasRechazar', summary: 'Rechazar una empresa',
      csrf: true, params: ['id'], body: 'MotivoRechazo', bodyRequired: false, errors: ['404'],
      responses: { 200: message() } }),
  },

  // ── Ofertas (moderación) ───────────────────────────────────────────────────
  '/api/admin/ofertas/pendientes': {
    get: adminOp({ id: 'adminOfertasPendientes', summary: 'Ofertas pendientes de moderación',
      responses: { 200: listaSimple(REF.schema('Oferta')) } }),
  },
  '/api/admin/ofertas': {
    get: adminOp({ id: 'adminOfertasList', summary: 'Listar todas las ofertas',
      query: ['pageParam', 'limitParam', REF.param('estadoQuery')],
      responses: { 200: paginated('Oferta') } }),
  },
  '/api/admin/ofertas/{id}/moderar': {
    patch: adminOp({ id: 'adminOfertasModerar', summary: 'Moderar una oferta (aprobar/pausar/rechazar/cerrar)',
      csrf: true, params: ['id'], body: 'AdminModerarOferta', errors: ['400', '404'],
      responses: {
        200: message({
          data: {
            type: 'object',
            properties: { estado: { type: 'string' }, moderada: { type: 'boolean' } },
          },
        }),
      } }),
  },

  // ── Logs de auditoría ──────────────────────────────────────────────────────
  '/api/admin/logs': {
    get: adminOp({ id: 'adminLogsList', summary: 'Listar el log de auditoría',
      query: ['pageParam', 'limitParam', ...logFilters],
      responses: { 200: paginated('ActivityLog') } }),
  },
  '/api/admin/logs/export': {
    get: adminOp({ id: 'adminLogsExport', summary: 'Exportar el log de auditoría a CSV',
      description: 'Devuelve un CSV (máx. 5000 filas) con BOM.',
      query: logFilters,
      responses: { 200: file('text/csv', 'CSV con las columnas ID,Fecha,Acción,Entidad,EntidadID,Usuario,Email,IP,Detalle.') } }),
  },

  // ── Solicitudes de empresa ─────────────────────────────────────────────────
  '/api/admin/solicitudes-empresa': {
    get: adminOp({ id: 'adminSolicitudesEmpresaList', summary: 'Listar solicitudes de empresa',
      query: ['pageParam', 'limitParam', REF.param('estadoQuery')],
      responses: {
        200: paginated('SolicitudEmpresa', {
          extraProps: { conteoPorEstado: { type: 'object', additionalProperties: { type: 'integer' } } },
        }),
      } }),
  },
  '/api/admin/solicitudes-empresa/{id}/aprobar': {
    patch: adminOp({ id: 'adminSolicitudEmpresaAprobar', summary: 'Aprobar una solicitud de empresa',
      description: 'Crea `Usuario` (rol empresa) + `Empresa` (aprobada) + `EmpresaUsuario` (admin_empresa).',
      csrf: true, params: ['id'], errors: ['400', '404'],
      responses: {
        200: message({
          data: {
            type: 'object',
            properties: {
              empresaId: { type: 'integer' },
              usuarioId: { type: 'integer' },
              email: { type: 'string' },
              reclutadoresPendientes: { type: 'integer' },
              passwordGenerada: { type: 'string', description: 'Solo fuera de producción.' },
            },
          },
        }),
      } }),
  },
  '/api/admin/solicitudes-empresa/{id}/rechazar': {
    patch: adminOp({ id: 'adminSolicitudEmpresaRechazar', summary: 'Rechazar una solicitud de empresa',
      description: 'El body no puede faltar por completo (body vacío → 500). `motivo` es opcional.',
      csrf: true, params: ['id'], body: 'MotivoRechazo', errors: ['400', '404', '500'],
      responses: { 200: message() } }),
  },

  // ── Solicitudes de reclutador ──────────────────────────────────────────────
  '/api/admin/solicitudes-reclutador': {
    get: adminOp({ id: 'adminSolicitudesReclutadorList', summary: 'Listar solicitudes de reclutador',
      query: ['pageParam', 'limitParam', REF.param('estadoQuery')],
      responses: {
        200: paginated('SolicitudReclutador', {
          extraProps: { conteoPorEstado: { type: 'object', additionalProperties: { type: 'integer' } } },
        }),
      } }),
  },
  '/api/admin/solicitudes-reclutador/{id}/aprobar': {
    patch: adminOp({ id: 'adminSolicitudReclutadorAprobar', summary: 'Aprobar una solicitud de reclutador',
      description: 'Crea `Usuario` (rol empresa) + `EmpresaUsuario` (reclutador).',
      csrf: true, params: ['id'], errors: ['400', '404'],
      responses: {
        200: message({
          data: {
            type: 'object',
            properties: {
              usuarioId: { type: 'integer' },
              email: { type: 'string' },
              passwordGenerada: { type: 'string', description: 'Solo fuera de producción.' },
            },
          },
        }),
      } }),
  },
  '/api/admin/solicitudes-reclutador/{id}/rechazar': {
    patch: adminOp({ id: 'adminSolicitudReclutadorRechazar', summary: 'Rechazar una solicitud de reclutador',
      description: 'El body no puede faltar por completo (body vacío → 500). `motivo` es opcional.',
      csrf: true, params: ['id'], body: 'MotivoRechazo', errors: ['400', '404', '500'],
      responses: { 200: message() } }),
  },

  // ── Importación masiva de alumnos/egresados (CSV) ──────────────────────────
  '/api/admin/importaciones/alumnos/plantilla': {
    get: adminOp({ id: 'adminImportacionPlantilla', summary: 'Descargar la plantilla CSV de importación',
      description: 'CSV UTF-8 con BOM. Columnas: legajo,nombre,apellido,email,rol,carrera,anioEgreso,telefono,ubicacion.',
      responses: { 200: file('text/csv', 'Plantilla con 1 fila de ejemplo alumno y 1 egresado.') } }),
  },
  '/api/admin/importaciones/alumnos': {
    post: adminOp({
      id: 'adminImportacionAlumnos', summary: 'Importar alumnos/egresados desde CSV',
      description:
        'Con `?dryRun=true` solo analiza el archivo (no escribe nada) y devuelve el detalle fila por fila. ' +
        'Sin ese query param, confirma: crea Usuario+Perfil por cada fila válida dentro de una transacción, ' +
        'nunca recibe contraseñas (genera un token de activación de un solo uso por usuario y lo envía por ' +
        'email — reutiliza el mismo flujo que POST /api/auth/reset-password/{token}). `devTokens` solo aparece ' +
        'fuera de producción y sin SMTP configurado.',
      csrf: true,
      query: [{ name: 'dryRun', in: 'query', schema: { type: 'string', enum: ['true'] } }],
      body: { type: 'object', required: ['archivo'], properties: { archivo: { type: 'string', format: 'binary' } } },
      bodyContentType: 'multipart/form-data',
      errors: ['400'],
      responses: {
        200: okRaw({
          dryRun: { type: 'boolean' },
          totalFilas: { type: 'integer' },
          validas: { type: 'integer' },
          invalidas: { type: 'integer' },
          totalCreados: { type: 'integer', description: 'Solo cuando dryRun no fue true.' },
          creados: { type: 'array', items: { type: 'object' }, description: 'Solo cuando dryRun no fue true.' },
          filas: { type: 'array', items: { type: 'object' }, description: 'Detalle por fila (solo en dry-run).' },
          devTokens: { type: 'array', items: { type: 'object' }, description: 'Solo fuera de producción y sin SMTP configurado.' },
        }, ['dryRun', 'totalFilas']),
      },
    }),
  },
};
