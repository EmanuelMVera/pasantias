// Reglas de transición de la moderación de ofertas (AdminOfertasPage). Vive en
// un .js aparte para que el componente exporte solo el componente
// (react-refresh/only-export-components). Las etiquetas y tonos de badge son
// compartidos con la vista de Ofertas de la empresa: utils/ofertaEstados.js.

export {
  ESTADO_TONO, ESTADO_LABEL, MODERACION_TONO, MODERACION_LABEL,
  OPCIONES_ESTADO, OPCIONES_MODERACION,
} from '../../utils/ofertaEstados';

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
