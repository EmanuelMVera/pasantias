import api from './api';

// ── Servicio de notificaciones ────────────────────────────────────────────────
// Funciones para los endpoints de /api/notificaciones
export const notificacionService = {
  getAll:       (params) => api.get('/notificaciones', { params }),
  sinLeerCount: () => api.get('/notificaciones/sin-leer-count'),
  leer:         (id) => api.patch(`/notificaciones/${id}/leer`),
  leerTodas:    () => api.patch('/notificaciones/leer-todas'),
  eliminar:     (id) => api.delete(`/notificaciones/${id}`),
};
