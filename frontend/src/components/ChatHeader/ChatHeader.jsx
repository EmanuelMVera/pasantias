import { useNavigate } from 'react-router-dom';
import Avatar from '../Avatar/Avatar';
import { displayNombre, displayAvatarProps } from '../../utils/chatDisplay';
import styles from './ChatHeader.module.css';

/** Encabezado de la conversación abierta: volver (móvil) + interlocutor + "Ver perfil". */
export default function ChatHeader({ partnerActivo, loadingMensajes, onVolver }) {
  const navigate = useNavigate();

  // Ver perfil — link a perfil público del interlocutor
  const perfilUrl = partnerActivo?.rol === 'empresa'
    ? (partnerActivo?.empresaId ? `/empresa/${partnerActivo.empresaId}` : null)
    : (partnerActivo?.id ? `/perfil/${partnerActivo.id}` : null);

  return (
    <div className={styles.chatHeader}>
      <button
        className={styles.backBtn}
        onClick={onVolver}
        aria-label="Volver a conversaciones"
      >
        ←
      </button>
      <Avatar
        {...displayAvatarProps(partnerActivo)}
        size={36}
        style={{ fontWeight: 800, fontSize: 36 * 0.38 }}
      />
      <div className={styles.chatHeaderInfo}>
        <strong>
          {loadingMensajes && !partnerActivo
            ? 'Cargando...'
            : displayNombre(partnerActivo)}
        </strong>
        <span>{partnerActivo?.email}</span>
      </div>
      {perfilUrl ? (
        <button
          className={styles.verPerfilBtn}
          onClick={() => navigate(perfilUrl)}
          title="Ver perfil"
        >
          Ver perfil
        </button>
      ) : (
        <button
          className={styles.verPerfilBtn}
          disabled
          title="Perfil no disponible"
        >
          Ver perfil
        </button>
      )}
    </div>
  );
}
