import Avatar from '../Avatar/Avatar';
import { formatHora } from '../../utils/chatDisplay';
import styles from './BurbujaMensaje.module.css';

/** Burbuja de mensaje individual */
export default function BurbujaMensaje({ mensaje, esMio }) {
  return (
    <div className={`${styles.burbujaWrap} ${esMio ? styles.burbujaWrapMia : ''}`}>
      {!esMio && (
        <Avatar
          nombre={mensaje.emisor?.nombre}
          apellido={mensaje.emisor?.apellido}
          src={mensaje.emisor?.fotoPerfil}
          size={30}
          style={{ fontWeight: 800, fontSize: 30 * 0.38 }}
        />
      )}
      <div className={`${styles.burbuja} ${esMio ? styles.burbujaMia : styles.burbujaSuya}`}>
        <p>{mensaje.mensaje ?? mensaje.contenido}</p>
        <span className={styles.burbujaHora}>
          {formatHora(mensaje.createdAt)}
          {esMio && (
            <span className={styles.burbujaLeido} title={mensaje.leido ? 'Leído' : 'Enviado'}>
              {mensaje.leido ? ' ✓✓' : ' ✓'}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
