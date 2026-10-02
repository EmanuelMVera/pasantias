/**
 * ofertaEstados.js — etiquetas y tonos de badge de los dos ejes de una oferta
 * (ciclo de vida `estado` y `estadoModeracion`). Fuente única para el panel de
 * moderación del admin del sistema y para la vista de Ofertas de la empresa.
 */

// Tonos de las clases globales .badge-tone-* (el texto siempre acompaña al color).
export const ESTADO_TONO = {
  activa:  'green',
  pausada: 'orange',
  cerrada: 'gray',
};
export const ESTADO_LABEL = {
  activa:  'Activa',
  pausada: 'Pausada',
  cerrada: 'Cerrada',
};

export const MODERACION_TONO = {
  pendiente:     'blue',
  aprobada:      'green',
  auto_aprobada: 'teal',
  rechazada:     'red',
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
