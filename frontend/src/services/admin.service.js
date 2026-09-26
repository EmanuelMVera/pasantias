import api from './api';

// ── Servicio de administración ────────────────────────────────────────────────
// Funciones para los endpoints de /api/admin (solo accesibles con rol admin)
export const adminService = {
  // Dashboard y métricas
  getActividadReciente:  () => api.get('/admin/actividad-reciente'),

  // Listado general de empresas + nivel de confianza institucional (RBAC-05)
  getEmpresas:            (params) => api.get('/admin/empresas', { params }),
  // accion: 'marcar' (→ confiable) | 'revocar' (→ estandar)
  cambiarConfianzaEmpresa: (id, accion) => api.patch(`/admin/empresas/${id}/confianza`, { accion }),

  // Moderación de ofertas
  getTodasOfertas:       (params) => api.get('/admin/ofertas', { params }),
  // accion: 'aprobar' | 'pausar' | 'rechazar' | 'cerrar'
  moderarOferta:         (id, accion) => api.patch(`/admin/ofertas/${id}/moderar`, { accion }),

  // CRUD de usuarios (v1.4)
  getUsuarios:           (params) => api.get('/admin/usuarios', { params }),
  crearUsuario:          (data) => api.post('/admin/usuarios', data),
  editarUsuario:         (id, data) => api.put(`/admin/usuarios/${id}`, data),
  toggleUsuario:         (id) => api.patch(`/admin/usuarios/${id}/toggle`),

  // Logs del sistema (v1.4)
  getLogs:               (params) => api.get('/admin/logs', { params }),
  // params puede incluir format: 'csv'|'xlsx'|'pdf' (default csv)
  exportarLogs:          (params) => api.get('/admin/logs/export', { params, responseType: 'blob' }),

  // Estadísticas profesionales (Fase 2)
  getEstadisticas:        (params) => api.get('/admin/estadisticas', { params }),
  // params puede incluir format: 'xlsx'|'pdf' (default xlsx)
  exportarEstadisticas:   (params) => api.get('/admin/estadisticas/export', { params, responseType: 'blob' }),

  // Solicitudes de registro de empresa (v1.6)
  getSolicitudesEmpresa:  (params) => api.get('/admin/solicitudes-empresa', { params }),
  aprobarSolicitud:       (id)     => api.patch(`/admin/solicitudes-empresa/${id}/aprobar`),
  rechazarSolicitud:      (id, motivo) => api.patch(`/admin/solicitudes-empresa/${id}/rechazar`, { motivo }),

  // Solicitudes de reclutadores (v1.7)
  getSolicitudesReclutador:      (params) => api.get('/admin/solicitudes-reclutador', { params }),
  aprobarSolicitudReclutador:    (id)     => api.patch(`/admin/solicitudes-reclutador/${id}/aprobar`),
  rechazarSolicitudReclutador:   (id, motivo) => api.patch(`/admin/solicitudes-reclutador/${id}/rechazar`, { motivo }),

  // Importación masiva de alumnos/egresados por CSV
  descargarPlantillaImportacion: () => api.get('/admin/importaciones/alumnos/plantilla', { responseType: 'blob' }),
  previsualizarImportacionCsv:   (formData) => api.post('/admin/importaciones/alumnos', formData, {
    params: { dryRun: true },
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  confirmarImportacionCsv:       (formData) => api.post('/admin/importaciones/alumnos', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};
