import styles from './SolicitudesStatsRow.module.css';

/**
 * SolicitudesStatsRow.jsx — fila de tarjetas de resumen (total/pendientes/etc.)
 * usada tanto para solicitudes de empresa como de reclutadores en
 * AdminSolicitudesPage.jsx (mismo bloque, antes duplicado 2 veces).
 *
 *   <SolicitudesStatsRow items={[{ label, value, color }, ...]} />
 */
export default function SolicitudesStatsRow({ items, style }) {
  return (
    <div className={styles.statsRow} style={style}>
      {items.map(({ label, value, color }) => (
        <div key={label} className={styles.statCard} style={{ '--stat-color': color }}>
          <span className={styles.statValue}>{value}</span>
          <span className={styles.statLabel}>{label}</span>
        </div>
      ))}
    </div>
  );
}
