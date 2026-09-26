/**
 * PageHeader.jsx — encabezado de página estándar.
 *
 * Envuelve el patrón `dashboard-header` (globals.css) usado en las páginas de
 * panel (Empresa/Admin/Alumno): título + subtítulo + acciones a la derecha.
 *
 *   <PageHeader title="Estadísticas" subtitle="Últimos 30 días" actions={<ExportMenu .../>} />
 */

import styles from './PageHeader.module.css';

export default function PageHeader({ title, subtitle, backTo, actions, children }) {
  return (
    <div className="dashboard-header">
      <div className={styles.text}>
        {backTo}
        <h1>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {children}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
