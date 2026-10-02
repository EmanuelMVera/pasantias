import { useNavigate } from 'react-router-dom';
import Avatar from '../Avatar/Avatar';
import { displayAvatarProps, displayEncabezado, perfilDestino } from '../../utils/chatDisplay';
import styles from './ChatHeader.module.css';

/**
 * Encabezado de la conversación abierta: volver (móvil) + interlocutor + acceso
 * a su perfil. El destino depende de quién es el interlocutor (ver
 * `perfilDestino`): alumno/egresado → su perfil; reclutador → su ficha;
 * administrador de empresa → el perfil de la empresa ("Ver empresa").
 */
export default function ChatHeader({ partnerActivo, loadingMensajes, onVolver }) {
  const navigate = useNavigate();

  const perfil = perfilDestino(partnerActivo);
  const { titulo, subtitulo } = displayEncabezado(partnerActivo);

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
            : titulo}
        </strong>
        {subtitulo && <span>{subtitulo}</span>}
      </div>
      {perfil ? (
        <button
          className={styles.verPerfilBtn}
          onClick={() => navigate(perfil.url)}
          title={perfil.label}
        >
          {perfil.label}
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
