/**
 * DataCard.jsx — card de un registro para la vista móvil/tablet de las tablas
 * del panel de administración (misma fuente de datos que la tabla).
 *
 *   <DataCard
 *     title="Acme SA" subtitle="Software · CUIT 30-1111"
 *     badge={<EstadoSolicitudBadge estado="pendiente" />}
 *     fields={[{ label: 'Contacto', value: 'a@acme.com' }, { label: 'Fecha', value: '12/03' }]}
 *     actions={<button className="btn-small">Revisar</button>}
 *   />
 *
 * Jerarquía: <h3> del título → subtítulo → lista de datos (<dl>) → acciones.
 * Los campos con `value` null/undefined/'' no se muestran.
 */

import styles from './DataCard.module.css';

export default function DataCard({ title, subtitle, badge, fields = [], actions, className = '' }) {
  const visibles = fields.filter((f) => f.value != null && f.value !== '');
  return (
    <article className={`${styles.card} ${className}`.trim()}>
      <header className={styles.head}>
        <h3 className={styles.title}>{title}</h3>
        {badge && <div className={styles.badge}>{badge}</div>}
      </header>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      {visibles.length > 0 && (
        <dl className={styles.fields}>
          {visibles.map((f) => (
            <div key={f.label} className={styles.field}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {actions && <div className={styles.actions}>{actions}</div>}
    </article>
  );
}
