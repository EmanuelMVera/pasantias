import ConversacionItem from '../ConversacionItem/ConversacionItem';
import styles from './ListaConversaciones.module.css';

/**
 * Panel izquierdo del chat: cabecera con "nuevo mensaje" + lista de
 * conversaciones (con estados loading / error / vacío).
 * `titulo` permite un encabezado contextual (p. ej. "Mensajes del equipo" para
 * el administrador de empresa, que solo chatea con su equipo).
 */
export default function ListaConversaciones({
  conversaciones,
  convActivaId,
  loading,
  error,
  onNuevoChat,
  onSeleccionar,
  titulo = '💬 Mensajes',
}) {
  return (
    <aside className={`${styles.sidebar} ${convActivaId ? styles.sidebarHiddenMobile : ''}`}>
      <div className={styles.sidebarHeader}>
        <h2>{titulo}</h2>
        <button
          className={styles.nuevoChatBtn}
          onClick={onNuevoChat}
          title="Nuevo mensaje"
          aria-label="Iniciar nueva conversación"
        >
          ✏️
        </button>
      </div>

      {loading ? (
        <div className={styles.sidebarLoading}>
          {[1, 2, 3].map((i) => <div key={i} className={styles.skeletonConv} />)}
        </div>
      ) : error ? (
        <p className={styles.sidebarError}>{error}</p>
      ) : conversaciones.length === 0 ? (
        <div className={styles.sidebarEmpty}>
          <span>✉️</span>
          <p>No tenés conversaciones aún.</p>
          <button
            className={styles.nuevoChatBtnEmpty}
            onClick={onNuevoChat}
          >
            Iniciar una conversación
          </button>
        </div>
      ) : (
        <div className={styles.convList}>
          {conversaciones.map((conv) => {
            const partnerId = conv.usuario?.id;
            return (
              <ConversacionItem
                key={partnerId}
                conv={conv}
                activo={partnerId === convActivaId}
                onClick={() => onSeleccionar(partnerId)}
              />
            );
          })}
        </div>
      )}
    </aside>
  );
}
