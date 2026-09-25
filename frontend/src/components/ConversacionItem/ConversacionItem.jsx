import Avatar from '../Avatar/Avatar';
import { displayNombre, displayAvatarProps, formatHora } from '../../utils/chatDisplay';
import styles from './ConversacionItem.module.css';

/**
 * Card de conversación en el panel lateral.
 * El backend devuelve: { usuario: {id, nombre, apellido, ...}, ultimoMensaje: {...}, noLeidos: N }
 */
export default function ConversacionItem({ conv, activo, onClick }) {
  const noLeidos = conv.noLeidos ?? 0;
  return (
    <div
      className={`${styles.convItem} ${activo ? styles.convActivo : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <Avatar
        {...displayAvatarProps(conv.usuario)}
        size={36}
        color={activo ? '#fff' : 'var(--primary)'}
        style={{ fontWeight: 800, fontSize: 36 * 0.38 }}
      />
      <div className={styles.convInfo}>
        <div className={styles.convNombreRow}>
          <strong className={styles.convNombre}>
            {displayNombre(conv.usuario)}
          </strong>
          <span className={styles.convHora}>
            {formatHora(conv.ultimoMensaje?.createdAt)}
          </span>
        </div>
        <div className={styles.convPreviewRow}>
          <span className={styles.convPreview}>
            {conv.ultimoMensaje?.mensaje ?? 'Sin mensajes'}
          </span>
          {noLeidos > 0 && (
            <span className={styles.convBadge}>{noLeidos}</span>
          )}
        </div>
      </div>
    </div>
  );
}
