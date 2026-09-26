import styles from './ActividadFeed.module.css';

/** Feed de actividad reciente (`limite` eventos como máximo). */
export default function ActividadFeed({ actividad, limite = 10 }) {
  if (!actividad || actividad.length === 0) return (
    <p className="msg">No hay actividad reciente registrada.</p>
  );

  return (
    <div className={styles.actividadList}>
      {actividad.slice(0, limite).map((item) => (
        <div key={item.id ?? `${item.accion}-${item.createdAt}`} className={styles.actividadItem}>
          <span className={styles.punto} aria-hidden="true" />
          <div className={styles.actividadBody}>
            <span>
              {item.usuario ? `${item.usuario.nombre} ${item.usuario.apellido}` : 'Sistema'} — {item.accion?.replace(/_/g, ' ')}
              {item.entidad ? ` (${item.entidad}${item.entidadId ? ` #${item.entidadId}` : ''})` : ''}
            </span>
            <span className={styles.actividadFecha}>
              {item.createdAt ? new Date(item.createdAt).toLocaleString('es-AR') : ''}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
