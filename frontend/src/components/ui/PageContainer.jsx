/**
 * PageContainer.jsx — Contenedor estándar de página.
 *
 * Reemplaza el patrón repetido `<div className="page-container" style={{ maxWidth: N }}>`
 * disperso por las páginas. Usa la clase global `.page-container` (padding fluido,
 * centrado) y limita el ancho con los tokens --maxw-* según `size`.
 *
 *   size="default" → 1100px (igual que .page-container)
 *   size="narrow"  → 780px  (lecturas largas, detalle de oferta)
 *   size="form"    → 720px  (formularios: perfil, mi empresa)
 *   size="card"    → 460px  (tarjetas de auth)
 */

import styles from './PageContainer.module.css';

const MAXW = {
  default: 'var(--maxw-page)',
  narrow: 'var(--maxw-narrow)',
  form: 'var(--maxw-form)',
  card: 'var(--maxw-card)',
};

export default function PageContainer({
  size = 'default',
  title,
  actions,
  className = '',
  children,
  ...rest
}) {
  return (
    <div
      className={`page-container ${className}`.trim()}
      style={size !== 'default' ? { maxWidth: MAXW[size] } : undefined}
      {...rest}
    >
      {(title || actions) && (
        <div className={actions ? 'dashboard-header' : undefined}>
          {title && <h1>{title}</h1>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
