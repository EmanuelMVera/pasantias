import Icon from '../ui/Icon';
import { ESTADO_CONFIG } from './estadoSolicitud.utils';

/** Badge del estado de una solicitud: ícono + texto (el color nunca va solo). */
export default function EstadoSolicitudBadge({ estado }) {
  const cfg = ESTADO_CONFIG[estado] ?? { label: estado, tone: 'gray', icon: 'info' };
  return (
    <span className={`badge badge-tone-${cfg.tone}`}>
      <Icon name={cfg.icon} size={14} strokeWidth={2} />
      {cfg.label}
    </span>
  );
}
