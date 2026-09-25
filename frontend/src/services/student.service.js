import api from './api';

// ── Servicio de alumno/egresado (dashboard) ───────────────────────────────────
// Funciones para /api/students
export const studentService = {
  getDashboard: () => api.get('/students/dashboard'),
};
