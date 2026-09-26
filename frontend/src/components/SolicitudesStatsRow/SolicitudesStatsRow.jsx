import StatCard from '../ui/StatCard';
import styles from './SolicitudesStatsRow.module.css';

/**
 * SolicitudesStatsRow.jsx — fila compacta de KPIs (total/pendientes/etc.)
 * usada para solicitudes de empresa y de reclutadores en AdminSolicitudesPage.
 * Los valores vienen del `conteoPorEstado` del backend.
 *
 *   <SolicitudesStatsRow items={[{ label, value, iconName, tone }, ...]} />
 */
export default function SolicitudesStatsRow({ items }) {
  return (
    <div className={styles.statsRow}>
      {items.map(({ label, value, iconName, tone }) => (
        <StatCard key={label} compact iconName={iconName} tone={tone} label={label} value={value} />
      ))}
    </div>
  );
}
