import { ESTADO_CONFIG } from '../EstadoSolicitudBadge/estadoSolicitud.utils';
import styles from './SolicitudesFiltroEstado.module.css';

const ESTADOS = ['', 'pendiente', 'aprobado', 'rechazado'];

/**
 * Filtro por estado de una lista de solicitudes (chips globales `.filter-chip`
 * con `aria-pressed`). `idPrefix` genera ids estables: `${idPrefix}-todos`,
 * `${idPrefix}-pendiente`, …
 */
export default function SolicitudesFiltroEstado({ value, onChange, idPrefix = 'filtro' }) {
  return (
    <div className={styles.filtros} role="group" aria-label="Filtrar por estado">
      <span className={styles.label} aria-hidden="true">Estado:</span>
      {ESTADOS.map((est) => (
        <button
          key={est}
          type="button"
          id={`${idPrefix}-${est || 'todos'}`}
          className={`filter-chip ${value === est ? 'is-active' : ''}`}
          aria-pressed={value === est}
          onClick={() => onChange(est)}
        >
          {est === '' ? 'Todos' : ESTADO_CONFIG[est]?.label}
        </button>
      ))}
    </div>
  );
}
