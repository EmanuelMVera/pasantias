import EstadoSolicitudBadge from '../EstadoSolicitudBadge/EstadoSolicitudBadge';
import { formatFecha } from '../EstadoSolicitudBadge/estadoSolicitud.utils';
import Paginacion from '../Paginacion/Paginacion';
import styles from './SolicitudesReclutadorSection.module.css';

/**
 * SolicitudesReclutadorSection.jsx — tabla de solicitudes de reclutador (con
 * confirmación inline de aprobación). Extraído de AdminSolicitudesPage.jsx;
 * el estado sigue viviendo en la página, este componente solo recibe datos y
 * callbacks.
 */
export default function SolicitudesReclutadorSection({
  solicitudesRecl,
  loadingRecl,
  filtroRecl,
  confirmandoRecl,
  onCancelarConfirmacion,
  accionandoRecl,
  onAprobar,
  onAbrirRechazo,
  paginationRecl,
  onPageChange,
}) {
  return (
    <>
      {loadingRecl ? (
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} />
          <p className="msg">Cargando solicitudes de reclutadores...</p>
        </div>
      ) : solicitudesRecl.length === 0 ? (
        <div className={styles.empty}>
          <span>📢</span>
          <p>No hay solicitudes de reclutadores{filtroRecl ? ` con estado "${filtroRecl}"` : ''}.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className="tabla">
            <thead>
              <tr>
                <th>#</th>
                <th>Empresa</th>
                <th>Nombre</th>
                <th>Email</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {solicitudesRecl.map(s => {
                const esPendiente = s.estado === 'pendiente';
                return (
                  <tr key={s.id} className={styles.fila}>
                    <td className={styles.idCell}>#{s.id}</td>
                    <td>
                      <div className={styles.empresaCell}>
                        <span className={styles.empresaAvatar}>
                          {s.empresa?.razonSocial?.[0] ?? '?'}
                        </span>
                        <strong>{s.empresa?.razonSocial ?? `Empresa #${s.empresaId}`}</strong>
                      </div>
                    </td>
                    <td>
                      <strong>{[s.nombre, s.apellido].filter(Boolean).join(' ')}</strong>
                    </td>
                    <td className={styles.emailCell}>{s.email}</td>
                    <td><EstadoSolicitudBadge estado={s.estado} /></td>
                    <td className={styles.fechaCell}>{formatFecha(s.createdAt)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      {esPendiente ? (
                        <div className={styles.accionesBtns}>
                          {confirmandoRecl === s.id ? (
                            <>
                              <span style={{ fontSize: '0.78rem', color: '#e67e22', fontWeight: 600 }}>¿Confirmar?</span>
                              <button className={styles.btnAprobar} disabled={accionandoRecl} onClick={() => onAprobar(s)}>
                                {accionandoRecl ? 'Procesando...' : '✅ Sí'}
                              </button>
                              <button className={styles.btnRechazar} onClick={onCancelarConfirmacion}>Cancelar</button>
                            </>
                          ) : (
                            <>
                              <button
                                className={styles.btnAprobar}
                                disabled={accionandoRecl}
                                onClick={() => onAprobar(s)}
                              >✅ Aprobar</button>
                              <button
                                className={styles.btnRechazar}
                                disabled={accionandoRecl}
                                onClick={() => onAbrirRechazo(s)}
                              >❌ Rechazar</button>
                            </>
                          )}
                        </div>
                      ) : (
                        <span className={styles.yaResuelta}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loadingRecl && (
        <Paginacion pagination={paginationRecl} onPageChange={onPageChange} />
      )}
    </>
  );
}
