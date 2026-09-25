import styles from './PendingQueueSection.module.css';

/**
 * PendingQueueSection.jsx — cola de aprobación del panel de administración:
 * título con contador → mensaje vacío → lista de cards con Aprobar/Rechazar.
 * Antes el mismo bloque estaba copiado 3 veces en AdminDashboardPage
 * (solicitudes de empresa, de reclutador y ofertas pendientes).
 *
 *   <PendingQueueSection
 *     title="Solicitudes de Empresa Pendientes" items={lista}
 *     emptyMessage="No hay solicitudes pendientes. ✅"
 *     renderItem={(e) => <><strong>{e.razonSocial}</strong><p>{e.email}</p></>}
 *     onAprobar={(id) => ...} onRechazar={(id) => ...}
 *   />
 */
export default function PendingQueueSection({ title, items, emptyMessage, renderItem, onAprobar, onRechazar }) {
  return (
    <section className={styles.adminSection}>
      <h2>{title} ({items.length})</h2>
      {items.length === 0 ? (
        <p className="msg">{emptyMessage}</p>
      ) : (
        <div className={styles.pendientesList}>
          {items.map((item) => (
            <div key={item.id} className={styles.pendienteCard}>
              <div>{renderItem(item)}</div>
              <div className={styles.pendienteActions}>
                <button className="btn-ok"     onClick={() => onAprobar(item.id)}>✓ Aprobar</button>
                <button className="btn-danger" onClick={() => onRechazar(item.id)}>✕ Rechazar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
