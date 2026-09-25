import Modal from '../Modal/Modal';
import styles from './ConfirmModal.module.css';

/* ── Modal de confirmación (suspender / quitar / recuperación) ──────────────── */
export default function ConfirmModal({
  title, icon, iconBg, miembro, nota, notaTone = 'warn',
  confirmLabel, confirmTone = 'danger', onConfirm, onClose,
}) {
  const nombre = miembro.usuario?.nombre ?? miembro.nombre ?? '';
  const apellido = miembro.usuario?.apellido ?? '';
  const email = miembro.usuario?.email ?? miembro.email;

  return (
    <Modal title={title} onClose={onClose} maxWidth={420}>
      <div className={styles.confirmHead}>
        <div className={styles.confirmIcon} style={{ background: iconBg }} aria-hidden="true">{icon}</div>
        <p className={styles.confirmName}>{nombre} {apellido}</p>
        <p className={styles.confirmEmail}>{email}</p>
      </div>
      <div className={`${styles.confirmNota} ${styles[`nota_${notaTone}`]}`}>{nota}</div>
      <div className={styles.confirmActions}>
        <button className={styles.btnSecondary} onClick={onClose}>Cancelar</button>
        <button className={`${styles.confirmBtn} ${styles[`confirmBtn_${confirmTone}`]}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
