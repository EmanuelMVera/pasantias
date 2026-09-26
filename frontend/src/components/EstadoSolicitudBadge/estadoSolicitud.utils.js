export const ESTADO_CONFIG = {
  pendiente: { label: 'Pendiente', tone: 'orange', icon: 'clock' },
  aprobado:  { label: 'Aprobado',  tone: 'green',  icon: 'checkCircle' },
  rechazado: { label: 'Rechazado', tone: 'red',    icon: 'xCircle' },
};

export function formatFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Solo la fecha (para columnas compactas de tabla). */
export function formatFechaCorta(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** `carrerasInteres` puede venir como array, como string JSON o vacío. */
export function parseCarreras(valor) {
  if (Array.isArray(valor)) return valor;
  if (typeof valor === 'string') {
    try {
      const parsed = JSON.parse(valor || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
