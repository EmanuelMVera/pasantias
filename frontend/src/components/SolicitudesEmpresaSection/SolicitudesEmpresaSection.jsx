import EstadoSolicitudBadge from '../EstadoSolicitudBadge/EstadoSolicitudBadge';
import { formatFechaCorta, parseCarreras } from '../EstadoSolicitudBadge/estadoSolicitud.utils';
import Paginacion from '../Paginacion/Paginacion';
import TableResponsive from '../ui/TableResponsive';
import DataCard from '../ui/DataCard';
import EmptyState from '../ui/EmptyState';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import styles from './SolicitudesEmpresaSection.module.css';
import { formatearCuitParaVista } from '../../utils/formatos';

/**
 * SolicitudesEmpresaSection.jsx — listado de solicitudes de empresa: tabla
 * compacta en escritorio, cards en tablet/móvil (misma fuente de datos).
 * La fila NO lleva acciones destructivas: "Revisar" abre el detalle, y desde
 * ahí se aprueba o rechaza. El estado vive en AdminSolicitudesPage.
 */
export default function SolicitudesEmpresaSection({
  solicitudes,
  loading,
  filtroEstado,
  detalleId,
  onRevisar,
  paginationEmp,
  onPageChange,
}) {
  const esTabla = useMediaQuery('(min-width: 1024px)');

  if (loading) return <p className="msg" role="status">Cargando solicitudes...</p>;

  if (solicitudes.length === 0) {
    return (
      <EmptyState
        iconName="inbox"
        title={`No hay solicitudes${filtroEstado ? ` con estado "${filtroEstado}"` : ''}.`}
      />
    );
  }

  const detalleEmpresa = (s) => [s.rubro, s.cuit && `CUIT ${formatearCuitParaVista(s.cuit)}`].filter(Boolean).join(' · ');

  return (
    <>
      {esTabla ? (
        <TableResponsive minWidth={680}>
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Contacto</th>
              <th>Carreras</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {solicitudes.map((s) => {
              const carreras = parseCarreras(s.carrerasInteres);
              return (
                <tr
                  key={s.id}
                  className={`${styles.fila} ${detalleId === s.id ? styles.filaActiva : ''}`}
                  aria-current={detalleId === s.id ? 'true' : undefined}
                  onClick={() => onRevisar(s)}
                >
                  <td className="cell-break">
                    <strong>{s.razonSocial}</strong>
                    {detalleEmpresa(s) && <small className={styles.sub}>{detalleEmpresa(s)}</small>}
                  </td>
                  <td className={`${styles.emailCell} cell-break`}>{s.email}</td>
                  <td>
                    <div className={styles.carrerasTags}>
                      {carreras.slice(0, 2).map((c) => (
                        <span key={c} className={styles.carreraTag}>{c}</span>
                      ))}
                      {carreras.length > 2 && (
                        <span className={styles.carreraMas}>+{carreras.length - 2}</span>
                      )}
                      {carreras.length === 0 && <span className={styles.sinCarreras}>—</span>}
                    </div>
                  </td>
                  <td><EstadoSolicitudBadge estado={s.estado} /></td>
                  <td className={styles.fechaCell}>{formatFechaCorta(s.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-small"
                      onClick={(e) => { e.stopPropagation(); onRevisar(s); }}
                      aria-label={`Revisar solicitud de ${s.razonSocial}`}
                    >
                      Revisar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableResponsive>
      ) : (
        <div className={styles.cards}>
          {solicitudes.map((s) => {
            const carreras = parseCarreras(s.carrerasInteres);
            return (
              <DataCard
                key={s.id}
                title={s.razonSocial}
                subtitle={detalleEmpresa(s)}
                badge={<EstadoSolicitudBadge estado={s.estado} />}
                fields={[
                  { label: 'Contacto', value: s.email },
                  { label: 'Carreras', value: carreras.length ? carreras.join(', ') : null },
                  { label: 'Fecha', value: formatFechaCorta(s.createdAt) },
                ]}
                actions={(
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => onRevisar(s)}
                    aria-label={`Revisar solicitud de ${s.razonSocial}`}
                  >
                    Revisar
                  </button>
                )}
              />
            );
          })}
        </div>
      )}

      <Paginacion pagination={paginationEmp} onPageChange={onPageChange} />
    </>
  );
}
