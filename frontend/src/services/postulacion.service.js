import api from './api';

// ── Servicio de postulaciones ─────────────────────────────────────────────────
// Funciones para los endpoints de /api/postulaciones
export const postulacionService = {
  postular: (data) => api.post('/postulaciones', data),                          // Postularse a una oferta
  getMias: (params) => api.get('/postulaciones/mis', { params }),                // Ver mis postulaciones
  getByOferta: (ofertaId, params) => api.get(`/postulaciones/oferta/${ofertaId}`, { params }), // Ver candidatos de una oferta
  updateEstado: (id, estado) => api.patch(`/postulaciones/${id}/estado`, { estado }), // Cambiar estado
};
