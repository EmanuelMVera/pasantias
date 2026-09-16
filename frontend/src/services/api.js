/**
 * api.js — Cliente HTTP centralizado para comunicarse con el backend.
 *
 * Usa Axios para hacer las peticiones a la API REST.
 * Configura automáticamente:
 * - La URL base del backend (VITE_API_URL o http://localhost:5000/api)
 * - `withCredentials: true` → el navegador manda la cookie de sesión HttpOnly
 *   (SEC-02); el token ya NO vive en localStorage ni se setea a mano
 * - El header X-CSRF-Token (double-submit) en métodos que mutan estado
 * - La redirección al login si la sesión expira (error 401)
 *
 * Exporta servicios agrupados por funcionalidad para usar en los componentes.
 */

import axios from 'axios';

// Crea una instancia de Axios con la configuración base.
// SEC-02: `withCredentials: true` → el navegador manda la cookie de sesión
// (HttpOnly) en cada request. El token ya NO vive en localStorage.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Lee una cookie del document (para el double-submit token CSRF).
function leerCookie(nombre) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + nombre + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

const METODOS_MUTANTES = ['post', 'put', 'patch', 'delete'];

// ── Archivos privados (CV, cartas de recomendación) — SEC-01 ────────────────────
// Ya no son URLs públicas servidas por /uploads: se piden autenticados a
// GET /api/archivos/:id (el interceptor de abajo adjunta el token igual que
// a cualquier otra request) y se abren/descargan como blob. Un <a href> plano
// no funcionaría acá — el navegador no manda el header Authorization en una
// navegación normal.
export async function abrirArchivoPrivado(archivoId, { comoDescarga = false, nombreArchivo = 'archivo' } = {}) {
  if (!archivoId) return;
  const { data } = await api.get(`/archivos/${archivoId}`, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(data);
  if (comoDescarga) {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else {
    window.open(blobUrl, '_blank');
  }
  // Libera el objeto en memoria una vez que el navegador ya lo usó para abrir/descargar
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

// ── Interceptor de request ────────────────────────────────────────────────────
// SEC-02: la sesión va por cookie (no hay header Authorization que setear).
// En métodos que mutan estado, se reenvía el token CSRF (double-submit).
api.interceptors.request.use((config) => {
  if (METODOS_MUTANTES.includes((config.method || 'get').toLowerCase())) {
    const csrf = leerCookie('csrf_token');
    if (csrf) config.headers['X-CSRF-Token'] = csrf;
  }
  return config;
});

// ── Interceptor de response ───────────────────────────────────────────────────
// 401 (sesión inválida/expirada). No hay token local que borrar, pero sí:
//  1. avisar a AuthContext para que limpie `usuario` (si no, una ruta pública
//     con `usuario` stale rebota a una ruta protegida);
//  2. en rutas no públicas, redirigir a /login con recarga dura (rehace todo
//     el estado limpiamente).
//
// Excepciones (NO redirigir ni limpiar):
// - Requests marcadas con `skipAuthRedirect` (el sondeo inicial /auth/me, cuyo
//   401 sólo significa "visitante anónimo").
// - Rutas públicas: sólo se limpia el estado, sin redirect.
const RUTAS_PUBLICAS = ['/', '/login', '/registro-empresa', '/forgot-password', '/reset-password'];

function enRutaPublica() {
  const path = window.location.pathname;
  // Match exacto o segmento completo — nunca un prefijo suelto (`/login-x` no
  // es pública).
  return RUTAS_PUBLICAS.some((r) => path === r || path.startsWith(r + '/'));
}

// AuthContext registra acá su limpiador de sesión al montar.
let onSesionExpirada = null;
export function setSesionExpiradaHandler(fn) { onSesionExpirada = fn; }

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.skipAuthRedirect) {
      if (typeof onSesionExpirada === 'function') onSesionExpirada();
      if (!enRutaPublica()) window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ── Servicio de autenticación ─────────────────────────────────────────────────
// Funciones para los endpoints de /api/auth
export const authService = {
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  // El 401 de este sondeo sólo significa "no hay sesión"; no debe redirigir.
  me: () => api.get('/auth/me', { skipAuthRedirect: true }),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post(`/auth/reset-password/${token}`, { password }),
  cambiarPassword: (passwordActual, nuevaPassword) =>
    api.put('/auth/cambiar-password', { passwordActual, nuevaPassword }),
};

// ── Servicio de solicitudes de registro de empresa ────────────────────────────
// Funciones para /api/solicitudes-empresa (pública, sin autenticación)
export const solicitudEmpresaService = {
  crear: (data) => api.post('/solicitudes-empresa', data),
};

// ── Servicio de estado del escenario demo ─────────────────────────────────────
// Funciones para /api/demo (pública, sin autenticación) — la usa LoginPage
// para saber si el escenario de presentación está realmente cargado antes de
// mostrar los botones de autocompletado.
export const demoService = {
  getStatus: () => api.get('/demo/status', { skipAuthRedirect: true }),
};


// ── Servicio de ofertas ───────────────────────────────────────────────────────
// Funciones para los endpoints de /api/ofertas
export const ofertaService = {
  getAll:          (params) => api.get('/ofertas', { params }),       // Listar ofertas (con filtros opcionales)
  getById:         (id) => api.get(`/ofertas/${id}`),                 // Ver detalle de una oferta
  create:          (data) => api.post('/ofertas', data),              // Publicar nueva oferta
  update:          (id, data) => api.put(`/ofertas/${id}`, data),     // Editar oferta existente
  delete:          (id) => api.delete(`/ofertas/${id}`),              // Cerrar oferta
  getRecomendadas: (params) => api.get('/ofertas/recomendadas', { params }), // Ofertas recomendadas para el alumno
};

// ── Servicio de postulaciones ─────────────────────────────────────────────────
// Funciones para los endpoints de /api/postulaciones
export const postulacionService = {
  postular: (data) => api.post('/postulaciones', data),                          // Postularse a una oferta
  getMias: (params) => api.get('/postulaciones/mis', { params }),                // Ver mis postulaciones
  getByOferta: (ofertaId, params) => api.get(`/postulaciones/oferta/${ofertaId}`, { params }), // Ver candidatos de una oferta
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
  // SEC-03: la foto de perfil se sube como imagen (JPG/PNG/WEBP), ya no como URL
  // de texto libre. Alternativa: una URL https externa validada server-side
  // (mismo endpoint, Content-Type JSON en vez de multipart).
  subirFoto: (formData) => api.post('/users/perfil/foto', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  establecerFotoUrl: (urlExterna) => api.post('/users/perfil/foto', { urlExterna }),
};

// ── Servicio de alumno/egresado (dashboard) ───────────────────────────────────
// Funciones para /api/students
export const studentService = {
  getDashboard: () => api.get('/students/dashboard'),
};

// ── Servicio de notificaciones ────────────────────────────────────────────────
// Funciones para los endpoints de /api/notificaciones
export const notificacionService = {
  getAll:       (params) => api.get('/notificaciones', { params }),
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

// ── Servicio de empresa ───────────────────────────────────────────────────────
// Funciones para los endpoints de /api/empresas (accesibles con rol empresa)
export const empresaService = {
  getDashboard:          () => api.get('/empresas/dashboard'),
  getMisOfertas:         (params) => api.get('/empresas/mis-ofertas', { params }),
  getMiEmpresa:          () => api.get('/empresas/mi-empresa'),
  getPublico:            (empresaId) => api.get(`/empresas/${empresaId}`), // Perfil de empresa (datos públicos, pero requiere sesión)
  updateMiEmpresa:       (data) => api.put('/empresas/mi-empresa', data),
  // SEC-03: el logo se sube como imagen (JPG/PNG/WEBP), solo admin_empresa.
  // Alternativa: URL https externa validada server-side (mismo endpoint).
  subirLogo:             (formData) => api.post('/empresas/mi-empresa/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  establecerLogoUrl:     (urlExterna) => api.post('/empresas/mi-empresa/logo', { urlExterna }),
  getCandidatos:         (params) => api.get('/empresas/candidatos', { params }),
  getEquipo:             () => api.get('/empresas/equipo'),
  editarMiembro:         (id, data) => api.patch(`/empresas/equipo/${id}`, data),
  // EST-10: ya no se manda una contraseña — el admin solo dispara el email
  // de recuperación; el propio miembro establece su contraseña.
  enviarRecuperacionMiembro: (id) => api.post(`/empresas/equipo/${id}/recuperacion`),
  eliminarMiembro:       (id) => api.delete(`/empresas/equipo/${id}`),
  // Solicitudes de reclutadores (reemplaza la creación directa)
  solicitarReclutador:        (data) => api.post('/empresas/equipo/solicitar', data),
  getMisSolicitudesReclutador: () => api.get('/empresas/equipo/solicitudes'),
};


export default api;

