import api from './api';

// ── Servicio de perfil de usuario ─────────────────────────────────────────────
// Funciones para los endpoints de /api/users
export const userService = {
  getPerfil: () => api.get('/users/perfil'),                          // Ver mi perfil
  updatePerfil: (data) => api.put('/users/perfil', data),             // Actualizar mi perfil
  getPerfilPublico: (usuarioId) => api.get(`/users/${usuarioId}/perfil`), // Perfil público de otro usuario
  subirCV: (formData) => api.post('/users/perfil/cv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },  // Header especial para subida de archivos
  }),
  subirCartaRecomendacion: (formData) => api.post('/users/perfil/carta-recomendacion', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  // SEC-03: la foto de perfil se sube como imagen (JPG/PNG/WEBP), ya no como URL
  // de texto libre. Alternativa: una URL https externa validada server-side
  // (mismo endpoint, Content-Type JSON en vez de multipart).
  subirFoto: (formData) => api.post('/users/perfil/foto', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  establecerFotoUrl: (urlExterna) => api.post('/users/perfil/foto', { urlExterna }),
};
