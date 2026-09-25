export const ESTADO_CONFIG = {
  pendiente: { label: 'Pendiente', color: '#e67e22', bg: '#fef3e2', icon: '🕐' },
  aprobado:  { label: 'Aprobado',  color: '#27ae60', bg: '#e8f8f0', icon: '✅' },
  rechazado: { label: 'Rechazado', color: '#c0392b', bg: '#fdecea', icon: '❌' },
};

export function formatFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
