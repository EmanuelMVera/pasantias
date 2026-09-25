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
 * Los servicios por dominio (auth, ofertas, empresa, etc.) viven en archivos
 * separados bajo este mismo directorio (`*.service.js`) y todos importan esta
 * instancia como `import api from './api'`.
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

export default api;
