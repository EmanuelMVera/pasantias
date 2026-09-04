/**
 * Toast.jsx — Render del toast de `useToast`, vía portal al <body>.
 *
 * `role="status"` + `aria-live="polite"` para que los lectores de pantalla
 * anuncien el mensaje. Apariencia igual a la que ya tenían PostulantesMiOferta
 * y MiEmpresa (pill oscura abajo a la derecha).
 */

import { createPortal } from 'react-dom';
import styles from './Toast.module.css';

export default function Toast({ toast }) {
  if (!toast || typeof document === 'undefined') return null;

  const tone = toast.tone === 'error' ? styles.error
    : toast.tone === 'success' ? styles.success
      : '';

  return createPortal(
    <div className={`${styles.toast} ${tone}`.trim()} role="status" aria-live="polite">
      {toast.msg}
    </div>,
    document.body,
  );
}
