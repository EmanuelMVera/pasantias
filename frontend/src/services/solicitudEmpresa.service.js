import api from './api';

// ── Servicio de solicitudes de registro de empresa ────────────────────────────
// Funciones para /api/solicitudes-empresa (pública, sin autenticación)
export const solicitudEmpresaService = {
  crear: (data) => api.post('/solicitudes-empresa', data),
};
