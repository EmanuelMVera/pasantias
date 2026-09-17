/**
 * StatCard.jsx — tarjeta de métrica (KPI) reutilizable.
 *
 * Unifica los `.metricCard`/`.statCard` casi duplicados que hoy existen por
 * separado en EmpresaDashboardPage, AdminDashboardPage y EquipoPage. Si se
 * pasa `onClick`, se renderiza como botón (navegación/filtro); si no, como
 * tarjeta estática. `loading` muestra un skeleton en vez del valor.
 *
 *   <StatCard icon="📢" label="Ofertas activas" value={12} color="var(--success)" />
 *   <StatCard icon="📋" label="Postulaciones" value={40} onClick={() => navigate(...)} />
 */

import styles from './StatCard.module.css';

export default function StatCard({ icon, label, value, color, tooltip, onClick, loading = false }) {
  if (loading) {
    return <div className={styles.card} aria-hidden="true"><div className={styles.skeleton} /></div>;
  }

  const contenido = (
    <>
      {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
      <span className={styles.value}>{value == null ? '—' : value}</span>
      <span className={styles.label}>{label}</span>
    </>
  );

  const props = {
    className: `${styles.card} ${onClick ? styles.clickable : ''}`,
    style: color ? { '--card-color': color } : undefined,
    title: tooltip,
  };

  return onClick
    ? <button type="button" onClick={onClick} {...props}>{contenido}</button>
    : <div {...props}>{contenido}</div>;
}
