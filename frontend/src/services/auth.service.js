import api from './api';

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
