import api from './api';

// ── Servicio de mensajes (chat) ─────────────────────────────────────────────
// Funciones para los endpoints de /api/chat (todos los roles autenticados)
export const mensajeService = {
  // GET /api/chat → lista de conversaciones del usuario autenticado
  getConversaciones: () => api.get('/chat'),
  // GET /api/chat/usuarios?q=texto → buscar usuarios para iniciar un nuevo chat
  buscarUsuarios: (q) => api.get('/chat/usuarios', { params: { q } }),
  // GET /api/chat/:usuarioId → historial de mensajes con un usuario específico
  getMensajes: (usuarioId, params) => api.get(`/chat/${usuarioId}`, { params }),
  // POST /api/chat → enviar mensaje: { receptorId, mensaje }
  enviar: (data) => api.post('/chat', data),
  // PATCH /api/chat/:usuarioId/leer → marcar conversación con ese usuario como leída
  marcarLeida: (usuarioId) => api.patch(`/chat/${usuarioId}/leer`),
};
