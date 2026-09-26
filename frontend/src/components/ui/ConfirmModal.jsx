/**
 * ConfirmModal.jsx — confirmación de una acción con consecuencias, sobre `Modal`.
 *
 *   <ConfirmModal
 *     title="Marcar empresa como confiable"
 *     confirmLabel="Marcar como confiable" tone="ok"
 *     busy={guardando} onConfirm={...} onClose={...}
 *   >
 *     <p>Explicación de qué cambia y qué no.</p>
 *   </ConfirmModal>
 *
 * `tone` elige el estilo del botón de confirmación (clases globales
 * `btn-ok` | `btn-warn` | `btn-danger` | `btn-primary`). Mientras `busy` no se
 * puede cerrar (ni con Escape, ni con click afuera) para no perder el resultado.
 */

import Modal from '../Modal/Modal';
import styles from './ConfirmModal.module.css';

const CLASE_TONO = {
  ok: 'btn-ok',
  warn: 'btn-warn',
  danger: 'btn-danger',
  primary: 'btn-primary',
};

export default function ConfirmModal({
  title,
  children,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'primary',
  busy = false,
  onConfirm,
  onClose,
  confirmId,
}) {
  return (
    <Modal title={title} onClose={busy ? () => {} : onClose} closeOnOverlayClick={!busy} maxWidth={480}>
      <div className={styles.body}>{children}</div>
      <div className={styles.footer}>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          id={confirmId}
          className={`${CLASE_TONO[tone] ?? CLASE_TONO.primary} ${styles.confirmar}`}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? 'Procesando…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
