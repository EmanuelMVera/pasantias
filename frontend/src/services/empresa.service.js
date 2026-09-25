import api from './api';

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
