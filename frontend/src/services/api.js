/**
 * api.js — Cliente HTTP centralizado para comunicarse con el backend.
 *
 * Usa Axios para hacer las peticiones a la API REST.
 * Configura automáticamente:
 * - La URL base del backend (desde variables de entorno)
 * - El token JWT en el header Authorization de cada request
 * - La redirección al login si el token expira (error 401)
 *
 * Exporta servicios agrupados por funcionalidad para usar en los componentes.
 */

import axios from 'axios';

// Crea una instancia de Axios con la configuración base
// La URL base se toma de la variable de entorno VITE_API_URL o usa localhost en desarrollo
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
});

// ── Archivos estáticos (CV, cartas de recomendación, etc.) ──────────────────────
// El backend sirve estos archivos fuera del prefijo /api (ej: /uploads/cv/archivo.pdf),
// por eso se deriva la misma VITE_API_URL quitándole el sufijo /api.
const FILES_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

// Arma la URL absoluta de un archivo servido por el backend (ej: perfil.cvPath, perfil.cartaRecomendacion)
export function getArchivoUrl(path) {
  return path ? `${FILES_BASE_URL}${path}` : null;
}

// ── Interceptor de request ────────────────────────────────────────────────────
// Antes de cada request, adjunta el token JWT del localStorage en el header Authorization
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Interceptor de response ───────────────────────────────────────────────────
// Si el servidor responde con 401 (no autorizado), limpia la sesión y redirige al login
api.interceptors.response.use(
  (response) => response, // Si la respuesta es exitosa, la devuelve sin cambios
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token'); // Elimina el token inválido/expirado
      window.location.href = '/login';  // Redirige al login
    }
    return Promise.reject(error);
  }
);

// ── Servicio de autenticación ─────────────────────────────────────────────────
// Funciones para los endpoints de /api/auth
export const authService = {
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post(`/auth/reset-password/${token}`, { password }),
  cambiarPassword: (passwordActual, nuevaPassword) =>
    api.put('/auth/cambiar-password', { passwordActual, nuevaPassword }),
};


// ── Servicio de ofertas ───────────────────────────────────────────────────────
// Funciones para los endpoints de /api/ofertas
export const ofertaService = {
  getAll:          (params) => api.get('/ofertas', { params }),       // Listar ofertas (con filtros opcionales)
  getById:         (id) => api.get(`/ofertas/${id}`),                 // Ver detalle de una oferta
  create:          (data) => api.post('/ofertas', data),              // Publicar nueva oferta
  update:          (id, data) => api.put(`/ofertas/${id}`, data),     // Editar oferta existente
  delete:          (id) => api.delete(`/ofertas/${id}`),              // Cerrar oferta
  getRecomendadas: () => api.get('/ofertas/recomendadas'),            // Ofertas recomendadas para el alumno
};

// ── Servicio de postulaciones ─────────────────────────────────────────────────
// Funciones para los endpoints de /api/postulaciones
export const postulacionService = {
  postular: (data) => api.post('/postulaciones', data),                          // Postularse a una oferta
  getMias: () => api.get('/postulaciones/mis'),                                  // Ver mis postulaciones
  getByOferta: (ofertaId) => api.get(`/postulaciones/oferta/${ofertaId}`),      // Ver candidatos de una oferta
  updateEstado: (id, estado) => api.patch(`/postulaciones/${id}/estado`, { estado }), // Cambiar estado
};

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
};

// ── Servicio de notificaciones ────────────────────────────────────────────────
// Funciones para los endpoints de /api/notificaciones
export const notificacionService = {
  getAll:       () => api.get('/notificaciones'),
  sinLeerCount: () => api.get('/notificaciones/sin-leer-count'),
  leer:         (id) => api.patch(`/notificaciones/${id}/leer`),
  leerTodas:    () => api.patch('/notificaciones/leer-todas'),
  eliminar:     (id) => api.delete(`/notificaciones/${id}`),
};

// ── Servicio de administración ────────────────────────────────────────────────
// Funciones para los endpoints de /api/admin (solo accesibles con rol admin)
export const adminService = {
  // Dashboard y métricas
  getStats:              () => api.get('/admin/stats'),
  getDashboardGeneral:   () => api.get('/admin/dashboard-general'),
  getActividadReciente:  () => api.get('/admin/actividad-reciente'),

  // Gestión de empresas
  getEmpresasPendientes: () => api.get('/admin/empresas/pendientes'),
  aprobarEmpresa:        (id) => api.patch(`/admin/empresas/${id}/aprobar`),
  rechazarEmpresa:       (id) => api.patch(`/admin/empresas/${id}/rechazar`),

  // Moderación de ofertas
  getOfertasPendientes:  () => api.get('/admin/ofertas/pendientes'),
  getTodasOfertas:       (params) => api.get('/admin/ofertas', { params }),
  // accion: 'aprobar' | 'pausar' | 'rechazar' | 'cerrar'  (o legacy aprobada: bool)
  moderarOferta:         (id, accion) => {
    const body = typeof accion === 'boolean' ? { aprobada: accion } : { accion };
    return api.patch(`/admin/ofertas/${id}/moderar`, body);
  },

  // CRUD de usuarios (v1.4)
  getUsuarios:           (params) => api.get('/admin/usuarios', { params }),
  getUsuario:            (id) => api.get(`/admin/usuarios/${id}`),
  crearUsuario:          (data) => api.post('/admin/usuarios', data),
  editarUsuario:         (id, data) => api.put(`/admin/usuarios/${id}`, data),
  eliminarUsuario:       (id) => api.delete(`/admin/usuarios/${id}`),
  toggleUsuario:         (id) => api.patch(`/admin/usuarios/${id}/toggle`),

  // Logs del sistema (v1.4)
  getLogs:               (params) => api.get('/admin/logs', { params }),
  exportarLogs:          (params) => api.get('/admin/logs/export', { params, responseType: 'blob' }),

  // Solicitudes de registro de empresa (v1.6)
  getSolicitudesEmpresa:  (params) => api.get('/admin/solicitudes-empresa', { params }),
  aprobarSolicitud:       (id)     => api.patch(`/admin/solicitudes-empresa/${id}/aprobar`),
  rechazarSolicitud:      (id, motivo) => api.patch(`/admin/solicitudes-empresa/${id}/rechazar`, { motivo }),

  // Solicitudes de reclutadores (v1.7)
  getSolicitudesReclutador:      (params) => api.get('/admin/solicitudes-reclutador', { params }),
  aprobarSolicitudReclutador:    (id)     => api.patch(`/admin/solicitudes-reclutador/${id}/aprobar`),
  rechazarSolicitudReclutador:   (id, motivo) => api.patch(`/admin/solicitudes-reclutador/${id}/rechazar`, { motivo }),
};



// ── Servicio de mensajes (chat) ─────────────────────────────────────────────
// Funciones para los endpoints de /api/chat (todos los roles autenticados)
export const mensajeService = {
  // GET /api/chat → lista de conversaciones del usuario autenticado
  getConversaciones: () => api.get('/chat'),
  // GET /api/chat/usuarios?q=texto → buscar usuarios para iniciar un nuevo chat
  buscarUsuarios: (q) => api.get('/chat/usuarios', { params: { q } }),
  // GET /api/chat/:usuarioId → historial de mensajes con un usuario específico
  getMensajes: (usuarioId) => api.get(`/chat/${usuarioId}`),
  // POST /api/chat → enviar mensaje: { receptorId, mensaje }
  enviar: (data) => api.post('/chat', data),
  // PATCH /api/chat/:usuarioId/leer → marcar conversación con ese usuario como leída
  marcarLeida: (usuarioId) => api.patch(`/chat/${usuarioId}/leer`),
};

// ── Servicio de empresa ───────────────────────────────────────────────────────
// Funciones para los endpoints de /api/empresas (accesibles con rol empresa)
export const empresaService = {
  getDashboard:          () => api.get('/empresas/dashboard'),
  getMisOfertas:         () => api.get('/empresas/mis-ofertas'),
  getMiEmpresa:          () => api.get('/empresas/mi-empresa'),
  getPublico:            (empresaId) => api.get(`/empresas/${empresaId}`), // Perfil público de empresa
  updateMiEmpresa:       (data) => api.put('/empresas/mi-empresa', data),
  getCandidatos:         (params) => api.get('/empresas/candidatos', { params }),
  getEquipo:             () => api.get('/empresas/equipo'),
  editarMiembro:         (id, data) => api.patch(`/empresas/equipo/${id}`, data),
  resetPasswordMiembro:  (id, password) => api.patch(`/empresas/equipo/${id}/password`, { password }),
  eliminarMiembro:       (id) => api.delete(`/empresas/equipo/${id}`),
  // Solicitudes de reclutadores (reemplaza la creación directa)
  solicitarReclutador:        (data) => api.post('/empresas/equipo/solicitar', data),
  getMisSolicitudesReclutador: () => api.get('/empresas/equipo/solicitudes'),
};


export default api;

