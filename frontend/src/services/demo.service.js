import api from './api';

// ── Servicio de estado del escenario demo ─────────────────────────────────────
// Funciones para /api/demo (pública, sin autenticación) — la usa LoginPage
// para saber si el escenario de presentación está realmente cargado antes de
// mostrar los botones de autocompletado.
export const demoService = {
  getStatus: () => api.get('/demo/status', { skipAuthRedirect: true }),
};
