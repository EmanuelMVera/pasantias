import Modal from '../Modal/Modal';
import EstadoSolicitudBadge from '../EstadoSolicitudBadge/EstadoSolicitudBadge';
import { formatFecha } from '../EstadoSolicitudBadge/estadoSolicitud.utils';
import styles from './SolicitudReclutadorRevision.module.css';

/**
 * Modal de revisión de una solicitud de alta de reclutador. Mientras esté
 * pendiente permite aprobar (con confirmación visible en dos pasos) o rechazar
 * (abre el modal de motivo). El estado y los handlers viven en la página.
 */
export default function SolicitudReclutadorRevision({
  solicitud,
  accionando,
  confirmando,
  onPedirConfirmacion,
  onCancelarConfirmacion,
  onConfirmarAprobacion,
  onAbrirRechazo,
  onClose,
}) {
  const nombre = [solicitud.nombre, solicitud.apellido].filter(Boolean).join(' ');
  const empresa = solicitud.empresa?.razonSocial ?? `Empresa #${solicitud.empresaId}`;

  return (
    <Modal title="Solicitud de reclutador" onClose={onClose}>
      <div className={styles.cuerpo}>
        <EstadoSolicitudBadge estado={solicitud.estado} />
        <dl className={styles.datos}>
          <dt>Empresa</dt><dd>{empresa}</dd>
          <dt>Reclutador</dt><dd>{nombre}</dd>
          <dt>Email</dt><dd><a href={`mailto:${solicitud.email}`}>{solicitud.email}</a></dd>
          <dt>Enviada el</dt><dd>{formatFecha(solicitud.createdAt)}</dd>
          {solicitud.estado !== 'pendiente' && solicitud.motivoRechazo && (
            <><dt>Motivo</dt><dd>{solicitud.motivoRechazo}</dd></>
          )}
        </dl>

        {solicitud.estado === 'pendiente' && (
          confirmando ? (
            <div className={styles.confirmBox} role="group" aria-label="Confirmar aprobación">
              <p>
                <strong>¿Aprobar el alta de {nombre}?</strong> Se creará su cuenta de reclutador en{' '}
                {empresa} y se le enviarán las credenciales a <strong>{solicitud.email}</strong>.
              </p>
              <div className={styles.acciones}>
                <button type="button" className="btn-secondary" onClick={onCancelarConfirmacion} disabled={accionando}>
                  Cancelar
                </button>
                <button
                  type="button"
                  id="btn-confirmar-aprobar-recl"
                  className={styles.btnAprobar}
                  disabled={accionando}
                  onClick={() => onConfirmarAprobacion(solicitud)}
                >
                  {accionando ? 'Procesando...' : 'Sí, aprobar'}
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.acciones}>
              <button type="button" className="btn-secondary" onClick={() => onAbrirRechazo(solicitud)} disabled={accionando}>
                Rechazar
              </button>
              <button
                type="button"
                id="btn-aprobar-recl"
                className={styles.btnAprobar}
                disabled={accionando}
                onClick={onPedirConfirmacion}
              >
                Aprobar
              </button>
            </div>
          )
        )}
      </div>
    </Modal>
  );
}
