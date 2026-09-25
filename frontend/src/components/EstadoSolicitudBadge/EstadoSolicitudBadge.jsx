import { ESTADO_CONFIG } from './estadoSolicitud.utils';
import styles from './EstadoSolicitudBadge.module.css';

export default function EstadoSolicitudBadge({ estado }) {
  const cfg = ESTADO_CONFIG[estado] ?? { label: estado, color: '#666', bg: '#eee', icon: '❓' };
  return (
    <span
      className={styles.estadoBadge}
      style={{ color: cfg.color, background: cfg.bg }}
    >
      {cfg.icon} {cfg.label}
    </span>
  );
}
