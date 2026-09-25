import styles from './MetricasGrid.module.css';

/**
 * Configuración de tarjetas de métricas.
 * action: función que recibe { navigate, setFiltroOferta, tablaRef } y define la acción al hacer click
 * (el contexto lo arma la página, ver `onSelect`).
 */
const METRIC_CARDS = [
  {
    key: 'ofertasActivas',  label: 'Ofertas Activas',   icon: '📢', color: 'var(--success)',
    action: ({ setFiltroOferta, tablaRef }) => { setFiltroOferta('activa'); tablaRef.current?.scrollIntoView({ behavior: 'smooth' }); },
  },
  {
    key: 'ofertasCerradas', label: 'Ofertas Cerradas',  icon: '🔒', color: 'var(--text-muted)',
    action: ({ setFiltroOferta, tablaRef }) => { setFiltroOferta('cerrada'); tablaRef.current?.scrollIntoView({ behavior: 'smooth' }); },
  },
  {
    key: 'postulaciones',   label: 'Postulaciones',     icon: '📋', color: 'var(--primary)',
    action: ({ navigate }) => navigate('/empresa/candidatos'),
  },
  {
    key: 'entrevistas',     label: 'Entrevistas',       icon: '🗓️', color: '#8e44ad',
    action: ({ navigate }) => navigate('/empresa/candidatos?estado=entrevista'),
  },
  {
    key: 'contrataciones',  label: 'Contrataciones',    icon: '🤝', color: '#16a085',
    action: ({ navigate }) => navigate('/empresa/candidatos?estado=contratado'),
  },
  {
    key: 'miembrosEquipo',  label: 'Miembros del equipo', icon: '👥', color: 'var(--secondary)',
    action: ({ navigate }) => navigate('/empresa/equipo'),
  },
];

// Orden de tarjetas para el reclutador: lo operativo (candidatos/entrevistas/
// ofertas) primero — lo estratégico (equipo) al final. Ninguna tarjeta se
// oculta (ambos roles tienen acceso legítimo a todos estos datos), solo
// cambia el orden de lectura. admin_empresa mantiene el orden por defecto
// (empresa/equipo primero).
const ORDEN_RECLUTADOR = ['postulaciones', 'entrevistas', 'contrataciones', 'ofertasActivas', 'ofertasCerradas', 'miembrosEquipo'];

/**
 * Grilla de tarjetas de métricas del dashboard de empresa (con skeleton).
 * `onSelect(action)` lo resuelve la página: es quien tiene navigate,
 * setFiltroOferta y el ref de la tabla que las acciones necesitan.
 */
export default function MetricasGrid({ loading, metricas, esReclutador, onSelect }) {
  const cards = esReclutador
    ? ORDEN_RECLUTADOR.map((k) => METRIC_CARDS.find((c) => c.key === k))
    : METRIC_CARDS;

  if (loading) {
    return (
      <div className={styles.skeletonGrid}>
        {cards.map((c) => <div key={c.key} className={styles.skeletonCard} />)}
      </div>
    );
  }

  return (
    <div className={styles.metricsGrid}>
      {cards.map(({ key, label, icon, color, action }) => (
        <button
          key={key}
          className={`${styles.metricCard} ${styles.metricCardBtn}`}
          style={{ '--card-color': color }}
          onClick={() => onSelect(action)}
          title={`Ver ${label.toLowerCase()}`}
        >
          <span className={styles.metricIcon}>{icon}</span>
          <span className={styles.metricValue}>{metricas?.[key] ?? '—'}</span>
          <span className={styles.metricLabel}>{label}</span>
        </button>
      ))}
    </div>
  );
}
