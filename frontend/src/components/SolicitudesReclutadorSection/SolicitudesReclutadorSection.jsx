import EstadoSolicitudBadge from '../EstadoSolicitudBadge/EstadoSolicitudBadge';
import { formatFechaCorta } from '../EstadoSolicitudBadge/estadoSolicitud.utils';
import Paginacion from '../Paginacion/Paginacion';
import TableResponsive from '../ui/TableResponsive';
import DataCard from '../ui/DataCard';
import EmptyState from '../ui/EmptyState';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import styles from './SolicitudesReclutadorSection.module.css';

/**
 * SolicitudesReclutadorSection.jsx — listado de solicitudes de alta de
 * reclutador: tabla compacta en escritorio, cards en tablet/móvil. "Revisar"
 * abre el detalle (Modal) donde se aprueba o rechaza; el estado vive en
 * AdminSolicitudesPage.
 */
export default function SolicitudesReclutadorSection({
  solicitudesRecl,
  loadingRecl,
  filtroRecl,
  onRevisar,
  paginationRecl,
  onPageChange,
}) {
  const esTabla = useMediaQuery('(min-width: 1024px)');

  if (loadingRecl) return <p className="msg" role="status">Cargando solicitudes de reclutadores...</p>;

  if (solicitudesRecl.length === 0) {
    return (
      <EmptyState
        iconName="userPlus"
        title={`No hay solicitudes de reclutadores${filtroRecl ? ` con estado "${filtroRecl}"` : ''}.`}
      />
    );
  }

  const nombreEmpresa = (s) => s.empresa?.razonSocial ?? `Empresa #${s.empresaId}`;
  const nombreReclutador = (s) => [s.nombre, s.apellido].filter(Boolean).join(' ');

  return (
    <>
      {esTabla ? (
        <TableResponsive minWidth={640}>
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Reclutador</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {solicitudesRecl.map((s) => (
              <tr key={s.id} className={styles.fila} onClick={() => onRevisar(s)}>
                <td className="cell-break"><strong>{nombreEmpresa(s)}</strong></td>
                <td className="cell-break">
                  <strong>{nombreReclutador(s)}</strong>
                  <small className={styles.sub}>{s.email}</small>
                </td>
                <td><EstadoSolicitudBadge estado={s.estado} /></td>
                <td className={styles.fechaCell}>{formatFechaCorta(s.createdAt)}</td>
                <td>
                  <button
                    type="button"
                    className="btn-small"
                    onClick={(e) => { e.stopPropagation(); onRevisar(s); }}
                    aria-label={`Revisar solicitud de ${nombreReclutador(s)}`}
                  >
                    Revisar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </TableResponsive>
      ) : (
        <div className={styles.cards}>
          {solicitudesRecl.map((s) => (
            <DataCard
              key={s.id}
              title={nombreReclutador(s)}
              subtitle={s.email}
              badge={<EstadoSolicitudBadge estado={s.estado} />}
              fields={[
                { label: 'Empresa', value: nombreEmpresa(s) },
                { label: 'Fecha', value: formatFechaCorta(s.createdAt) },
              ]}
              actions={(
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => onRevisar(s)}
                  aria-label={`Revisar solicitud de ${nombreReclutador(s)}`}
                >
                  Revisar
                </button>
              )}
            />
          ))}
        </div>
      )}

      <Paginacion pagination={paginationRecl} onPageChange={onPageChange} />
    </>
  );
}
