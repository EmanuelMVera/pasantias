import FilterGroup from '../ui/FilterGroup';
import { ESTADO_CONFIG } from '../EstadoSolicitudBadge/estadoSolicitud.utils';

const OPCIONES = [
  { value: '', label: 'Todos' },
  ...['pendiente', 'aprobado', 'rechazado'].map((est) => ({ value: est, label: ESTADO_CONFIG[est].label })),
];

/**
 * Filtro por estado de una lista de solicitudes (control segmentado con
 * `aria-pressed`). `idPrefix` genera ids estables: `${idPrefix}-todos`,
 * `${idPrefix}-pendiente`, …
 */
export default function SolicitudesFiltroEstado({ value, onChange, idPrefix = 'filtro' }) {
  return (
    <FilterGroup label="Estado" options={OPCIONES} value={value} onChange={onChange} idPrefix={idPrefix} />
  );
}
