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

  /* Foco inicial dentro del panel + trap de Tab + restaurar el foco al cerrar. */
  useEffect(() => {
    const disparador = document.activeElement;
    const panel = panelRef.current;

    const focusables = () =>
      panel
        ? [...panel.querySelectorAll(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
          )].filter((el) => el.offsetParent !== null)
        : [];

    const primero = focusables()[0];
    (primero || panel)?.focus();

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (f.length === 0) { e.preventDefault(); return; }
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    panel?.addEventListener('keydown', onKeyDown);
    return () => {
      panel?.removeEventListener('keydown', onKeyDown);
      if (disparador instanceof HTMLElement) disparador.focus();
    };
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
