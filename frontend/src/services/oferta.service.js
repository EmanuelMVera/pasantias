import api from './api';

// ── Servicio de ofertas ───────────────────────────────────────────────────────
// Funciones para los endpoints de /api/ofertas
export const ofertaService = {
  getAll:          (params) => api.get('/ofertas', { params }),       // Listar ofertas (con filtros opcionales)
  getById:         (id) => api.get(`/ofertas/${id}`),                 // Ver detalle de una oferta
  create:          (data) => api.post('/ofertas', data),              // Publicar nueva oferta (solo reclutador)
  update:          (id, data) => api.put(`/ofertas/${id}`, data),     // Editar contenido (solo reclutador responsable)
  cambiarEstado:   (id, estado) => api.patch(`/ofertas/${id}/estado`, { estado }), // Pausar/reactivar/cerrar
  getRecomendadas: (params) => api.get('/ofertas/recomendadas', { params }), // Ofertas recomendadas para el alumno
};
