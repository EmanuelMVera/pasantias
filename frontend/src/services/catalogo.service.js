import api from './api';

// ── Catálogos institucionales (lectura pública) ───────────────────────────────
// Fuente única: backend/src/data/catalogos.json, servido por /api/catalogos.
// No hardcodear listas de carreras en los componentes: usar useCarreras().
export const catalogoService = {
  getCarreras: () => api.get('/catalogos/carreras'),
};
