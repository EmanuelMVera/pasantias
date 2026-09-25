import styles from './SolicitudesReclutadoresTabla.module.css';

const ESTADO_SOLICITUD = {
  pendiente:  { label: 'Pendiente',  color: '#ca8a04', bg: '#fef9c3' },
  aprobado:   { label: 'Aprobado',   color: '#15803d', bg: '#dcfce7' },
  rechazado:  { label: 'Rechazado',  color: '#dc2626', bg: '#fee2e2' },
};

/* ── Fila de solicitud de reclutador ────────────────────────────────────────── */
function SolicitudRow({ sol }) {
  const est = ESTADO_SOLICITUD[sol.estado] ?? ESTADO_SOLICITUD.pendiente;
  return (
    <tr>
      <td><strong>{sol.nombre}</strong></td>
      <td className={`${styles.cellMuted} cell-break`}>{sol.email}</td>
      <td>
        <span className={styles.estadoPill} style={{ background: est.bg, color: est.color }}>
          {est.label}
        </span>
      </td>
      <td className={styles.cellFecha}>
        {new Date(sol.createdAt).toLocaleDateString('es-AR')}
      </td>
    </tr>
  );
}

/* ── Historial de solicitudes de reclutadores ───────────────────────────────── */
export default function SolicitudesReclutadoresTabla({ solicitudes }) {
  return (
    <section className={styles.seccion} style={{ marginTop: '2rem' }}>
      <h2 className={styles.seccionTitulo}>Solicitudes de reclutadores</h2>
      <div className={styles.tablaWrap}>
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Estado</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {solicitudes.map(s => <SolicitudRow key={s.id} sol={s} />)}
          </tbody>
        </table>
      </div>
    </section>
  );
}
