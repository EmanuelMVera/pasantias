// Etiquetas, colores y reglas de transición de la moderación de ofertas
// (AdminOfertasPage). Vive en un .js aparte para que el componente exporte solo
// el componente (react-refresh/only-export-components).

export const ESTADO_COLOR = {
  activa:  '#1e8449',
  pausada: '#b9770e',
  cerrada: '#707b7c',
};
export const ESTADO_LABEL = {
  activa:  'Activa',
  pausada: 'Pausada',
  cerrada: 'Cerrada',
};

export const MODERACION_COLOR = {
  pendiente:     '#2e86c1',
  aprobada:      '#1e8449',
  auto_aprobada: '#117a65',
  rechazada:     '#c0392b',
};
export const MODERACION_LABEL = {
  pendiente:     'Pendiente de revisión',
  aprobada:      'Aprobada',
  auto_aprobada: 'Publicación automática',
  rechazada:     'Rechazada',
};

export const OPCIONES_ESTADO = [
  { value: '', label: 'Todos' },
  ...Object.entries(ESTADO_LABEL).map(([value, label]) => ({ value, label })),
];
export const OPCIONES_MODERACION = [
  { value: '', label: 'Todas' },
  ...['pendiente', 'aprobada', 'rechazada', 'auto_aprobada'].map((value) => ({
    value,
    label: MODERACION_LABEL[value],
  })),
];

// Transiciones válidas — mismas reglas que el backend (adminModeracion.service.js
// / oferta.service.js::TRANSICIONES_ESTADO) — solo para no ofrecer un botón que
// el servidor va a rechazar; la autoridad real sigue siendo el backend.
const TRANSICIONES_MODERACION = {
  pendiente:     ['aprobada', 'rechazada'],
  auto_aprobada: ['rechazada'],
  aprobada:      ['rechazada'],
  rechazada:     [],
};

export const puedeAprobar  = (o) => (TRANSICIONES_MODERACION[o.estadoModeracion] || []).includes('aprobada');
export const puedeRechazar = (o) => (TRANSICIONES_MODERACION[o.estadoModeracion] || []).includes('rechazada');
export const puedePausar   = (o) => o.estado === 'activa';
export const puedeCerrar   = (o) => o.estado === 'activa' || o.estado === 'pausada';
