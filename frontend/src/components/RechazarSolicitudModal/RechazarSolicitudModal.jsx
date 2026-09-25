import Modal from '../Modal/Modal';
import styles from './RechazarSolicitudModal.module.css';

/**
 * RechazarSolicitudModal.jsx — modal de rechazo con motivo opcional, usado por
 * AdminSolicitudesPage.jsx tanto para solicitudes de empresa como de
 * reclutadores (antes el mismo modal duplicado 2 veces con distinto texto).
 */
export default function RechazarSolicitudModal({
  titulo,
  children,
  motivo,
  onMotivoChange,
  motivoInputId,
  motivoLabel = 'Motivo',
  motivoPlaceholder,
  rows = 3,
  accionando,
  onClose,
  onConfirm,
  confirmButtonId,
}) {
  return (
    <Modal title={titulo} onClose={onClose}>
      <p className={styles.modalBody}>{children}</p>
      <div className="form-group">
        <label htmlFor={motivoInputId}>
          {motivoLabel} <span className={styles.opcional}>(opcional)</span>
        </label>
        <textarea
          id={motivoInputId}
          value={motivo}
          onChange={(e) => onMotivoChange(e.target.value)}
          placeholder={motivoPlaceholder}
          rows={rows}
          style={{ width: '100%', resize: 'vertical' }}
        />
      </div>
      <div className={styles.modalFooter}>
        <button className="btn-secondary" onClick={onClose} disabled={accionando}>Cancelar</button>
        <button id={confirmButtonId} className={styles.btnRechazarLg} onClick={onConfirm} disabled={accionando}>
          {accionando ? 'Rechazando...' : 'Confirmar rechazo'}
        </button>
      </div>
    </Modal>
  );
}
