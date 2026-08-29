/**
 * Modal.jsx — Base de overlay/panel reutilizable (FE-02).
 *
 * Centraliza el patrón repetido en EquipoPage, AdminUsuariosPage,
 * AdminSolicitudesPage y ChatPage: overlay que cierra al hacer click afuera,
 * panel que no propaga el click, cierre con Escape, y una fila de header
 * opcional (título + botón ✕) cuando el caller la necesita.
 *
 * No representa ningún concepto de negocio — el contenido (formularios,
 * confirmaciones, buscadores) sigue viviendo en cada pantalla como children.
 */

import { useEffect, useId, useRef } from 'react';
import styles from './Modal.module.css';

export default function Modal({
  onClose,
  title,
  ariaLabel,
  maxWidth,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className = '',
  style,
  children,
}) {
  const panelRef = useRef(null);
  const headerTitleId = useId();

  useEffect(() => {
    if (!closeOnEscape) return;
    const onKeyDown = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, closeOnEscape]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const dialogProps = title
    ? { 'aria-labelledby': headerTitleId }
    : { 'aria-label': ariaLabel };

  return (
    <div className={styles.overlay} onClick={closeOnOverlayClick ? onClose : undefined}>
      <div
        ref={panelRef}
        className={`${styles.panel} ${className}`.trim()}
        style={{ ...(maxWidth ? { maxWidth } : null), ...style }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        {...dialogProps}
      >
        {title && (
          <div className={styles.header}>
            <h3 id={headerTitleId}>{title}</h3>
            <button className={styles.close} onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
