/**
 * postulacionEstados.js — Fuente única de estados de postulación (FE-03).
 *
 * Antes: PostulantesMiOfertaPage, CandidatosEmpresaPage y MisPostulacionesPage
 * tenían cada una su propio mapa de labels/colores/emojis, con valores que ya
 * habían divergido entre sí (ej. "En revisión" era gris en dos pantallas y
 * ámbar en la tercera; "Contratado" vs "¡Contratado!"). Esto no cambia ningún
 * dato del backend — el backend ya consolidó los pares legacy/alias (EST-08):
 *
 *   entrevista_programada → entrevista
 *   no_seleccionado       → rechazado
 *
 * `aliases` acá solo existe como red de seguridad del lado de la presentación,
 * por si llega a la UI algún registro viejo no migrado — nunca se escribe de
 * vuelta al backend.
 */

export const ESTADOS_POSTULACION = {
  en_revision: {
    estado: 'en_revision',
    label: 'En revisión',
    emoji: '📥',
    color: '#64748b',
    bg: '#f1f5f9',
    aliases: [],
  },
  preseleccionado: {
    estado: 'preseleccionado',
    label: 'Preseleccionado',
    emoji: '⭐',
    color: '#2563eb',
    bg: '#eff6ff',
    aliases: [],
  },
  entrevista: {
    estado: 'entrevista',
    label: 'Entrevista',
    emoji: '🎙️',
    color: '#7c3aed',
    bg: '#f5f3ff',
    aliases: ['entrevista_programada'],
  },
  contratado: {
    estado: 'contratado',
    label: 'Contratado',
    emoji: '🎉',
    color: '#16a34a',
    bg: '#f0fdf4',
    aliases: [],
  },
  rechazado: {
    estado: 'rechazado',
    label: 'No seleccionado',
    emoji: '✕',
    color: '#dc2626',
    bg: '#fef2f2',
    aliases: ['no_seleccionado'],
  },
};

/** Orden canónico para listas/filtros/selects. */
export const LISTA_ESTADOS_POSTULACION = Object.values(ESTADOS_POSTULACION);

/** Estados en los que tiene sentido habilitar el botón de contactar/chatear. */
export const ESTADOS_HABILITAN_CHAT = ['preseleccionado', 'entrevista', 'contratado'];

const ALIAS_A_CANONICO = LISTA_ESTADOS_POSTULACION.reduce((mapa, def) => {
  def.aliases.forEach((alias) => { mapa[alias] = def.estado; });
  return mapa;
}, {});

/** Traduce un estado (posiblemente legacy) al estado canónico vigente. */
export function normalizarEstado(estado) {
  return ALIAS_A_CANONICO[estado] ?? estado;
}

/**
 * Info de presentación para un estado (ya normalizado). Nunca devuelve null:
 * ante un estado desconocido devuelve un fallback neutro, para que ningún
 * consumidor tenga que repetir su propia cadena de `?? valorPorDefecto`.
 */
export function getEstadoInfo(estado) {
  return ESTADOS_POSTULACION[normalizarEstado(estado)] ?? {
    estado,
    label: estado ?? 'Desconocido',
    emoji: '❓',
    color: '#6b7280',
    bg: '#f9fafb',
    aliases: [],
  };
}
