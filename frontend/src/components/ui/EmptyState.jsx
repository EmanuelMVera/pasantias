/**
 * EmptyState.jsx — Estado vacío / error de página, centrado.
 *
 * Unifica los bloques inline repetidos ("no hay ofertas activas", errores 404
 * de página, "cargando..."). El icono es decorativo (aria-hidden).
 *
 *   <EmptyState icon="🏢" title="Esta empresa no está disponible." />
 *   <EmptyState iconName="building" title="Sin empresas" />   (ícono SVG de ui/Icon)
 *   <EmptyState icon="📭" title="Sin resultados" hint="Probá con otros filtros.">
 *     <Button to="/ofertas">Ver todas</Button>
 *   </EmptyState>
 */

import Icon from './Icon';
import styles from './EmptyState.module.css';

export default function EmptyState({ icon, iconName, title, hint, children, className = '' }) {
  return (
    <div className={`${styles.wrap} ${className}`.trim()}>
      {iconName
        ? <span className={styles.iconSvg}><Icon name={iconName} size={28} /></span>
        : icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
      {title && <p className={styles.title}>{title}</p>}
      {hint && <p className={styles.hint}>{hint}</p>}
      {children && <div className={styles.actions}>{children}</div>}
    </div>
  );
}
