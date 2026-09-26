import EstadoSolicitudBadge from '../EstadoSolicitudBadge/EstadoSolicitudBadge';
import { formatFecha, parseCarreras } from '../EstadoSolicitudBadge/estadoSolicitud.utils';
import styles from './SolicitudEmpresaDetalle.module.css';

/**
 * Contenido del detalle de una solicitud de empresa. No lleva marco propio: la
 * página lo muestra en un panel lateral (ancho) o dentro de un Modal (angosto).
 *
 * Aprobar es un proceso en dos pasos VISIBLE: "Aprobar solicitud" muestra el
 * aviso de confirmación (qué se va a crear y a quién se le envían las
 * credenciales) y recién "Sí, aprobar" ejecuta. Rechazar abre su modal de motivo.
 */
export default function SolicitudEmpresaDetalle({
  detalle,
  accionando,
  confirmando,
  onPedirConfirmacion,
  onCancelarConfirmacion,
  onConfirmarAprobacion,
  onAbrirRechazo,
}) {
  const carreras = parseCarreras(detalle.carrerasInteres);
  const recls = Array.isArray(detalle.reclutadores)
    ? detalle.reclutadores.filter((r) => r?.nombre && r?.email)
    : [];
  const emailAcceso = detalle.responsableEmail || detalle.email;

  return (
    <>
      <div className={styles.detalleSection}>
        <EstadoSolicitudBadge estado={detalle.estado} />
        <p className={styles.detalleDate}>Enviada el {formatFecha(detalle.createdAt)}</p>
      </div>

      <div className={styles.detalleSection}>
        <h4 className={styles.detalleSectionTitle}>Empresa</h4>
        <dl className={styles.detalleDL}>
          <dt>Razón Social</dt><dd>{detalle.razonSocial}</dd>
          <dt>CUIT</dt><dd>{detalle.cuit}</dd>
          <dt>Rubro</dt><dd>{detalle.rubro || '—'}</dd>
          <dt>Ciudad</dt><dd>{detalle.ciudad || '—'}</dd>
          <dt>Dirección</dt><dd>{detalle.direccion || '—'}</dd>
          <dt>Teléfono</dt><dd>{detalle.telefono || '—'}</dd>
          <dt>Email contacto</dt>
          <dd><a href={`mailto:${detalle.email}`}>{detalle.email}</a></dd>
          {detalle.sitioWeb && (
            <>
              <dt>Sitio web</dt>
              <dd>
                <a href={detalle.sitioWeb} target="_blank" rel="noopener noreferrer">
                  {detalle.sitioWeb}
                </a>
              </dd>
            </>
          )}
        </dl>
      </div>

      {/* Datos del responsable */}
      <div className={styles.detalleSection}>
        <h4 className={styles.detalleSectionTitle}>Responsable / Administrador</h4>
        {(detalle.responsableNombre || detalle.responsableEmail) ? (
          <dl className={styles.detalleDL}>
            <dt>Nombre</dt>
            <dd>
              {[detalle.responsableNombre, detalle.responsableApellido].filter(Boolean).join(' ') || '—'}
            </dd>
            <dt>Email de acceso</dt>
            <dd>
              <a href={`mailto:${detalle.responsableEmail}`}>{detalle.responsableEmail}</a>
              <span className={styles.nota}>(recibirá las credenciales)</span>
            </dd>
            {detalle.responsableCargo && (
              <><dt>Cargo</dt><dd>{detalle.responsableCargo}</dd></>
            )}
            {detalle.responsableTelefono && (
              <><dt>Teléfono</dt><dd>{detalle.responsableTelefono}</dd></>
            )}
          </dl>
        ) : (
          <p className={styles.notaVacia}>
            Sin datos de responsable (solicitud anterior). Las credenciales se enviarán a {detalle.email}.
          </p>
        )}
      </div>

      {detalle.descripcion && (
        <div className={styles.detalleSection}>
          <h4 className={styles.detalleSectionTitle}>Descripción</h4>
          <p className={styles.detalleTexto}>{detalle.descripcion}</p>
        </div>
      )}

      {detalle.puestos && (
        <div className={styles.detalleSection}>
          <h4 className={styles.detalleSectionTitle}>Puestos de interés</h4>
          <p className={styles.detalleTexto}>{detalle.puestos}</p>
        </div>
      )}

      {carreras.length > 0 && (
        <div className={styles.detalleSection}>
          <h4 className={styles.detalleSectionTitle}>Carreras de interés</h4>
          <div className={styles.carrerasDetalle}>
            {carreras.map((c) => (
              <span key={c} className={styles.carreraTagDetalle}>{c}</span>
            ))}
          </div>
        </div>
      )}

      {recls.length > 0 && (
        <div className={styles.detalleSection}>
          <h4 className={styles.detalleSectionTitle}>Reclutadores solicitados ({recls.length})</h4>
          <p className={styles.reclNota}>
            Al aprobar esta solicitud se crearán como solicitudes de reclutador pendientes.
          </p>
          <ul className={styles.reclList}>
            {recls.map((r, i) => (
              <li key={i} className={styles.reclItem}>
                <span className={styles.reclItemNombre}>
                  {[r.nombre, r.apellido].filter(Boolean).join(' ')}
                </span>
                <span className={styles.reclItemSep}>·</span>
                <a href={`mailto:${r.email}`}>{r.email}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Resolución (solicitudes ya resueltas) */}
      {detalle.estado !== 'pendiente' && (detalle.revisadaEn || detalle.motivoRechazo) && (
        <div className={styles.detalleSection}>
          <h4 className={styles.detalleSectionTitle}>Resolución</h4>
          <dl className={styles.detalleDL}>
            {detalle.revisadaEn && (<><dt>Resuelta el</dt><dd>{formatFecha(detalle.revisadaEn)}</dd></>)}
            {detalle.motivoRechazo && (<><dt>Motivo</dt><dd>{detalle.motivoRechazo}</dd></>)}
          </dl>
        </div>
      )}

      {/* Acciones: solo mientras la solicitud está pendiente */}
      {detalle.estado === 'pendiente' && (
        confirmando ? (
          <div className={styles.confirmBox} role="group" aria-label="Confirmar aprobación">
            <p>
              <strong>¿Aprobar la solicitud de {detalle.razonSocial}?</strong> Se creará la empresa y la
              cuenta del responsable, y se enviarán las credenciales a <strong>{emailAcceso}</strong>.
            </p>
            <div className={styles.confirmActions}>
              <button type="button" className="btn-secondary" onClick={onCancelarConfirmacion} disabled={accionando}>
                Cancelar
              </button>
              <button
                type="button"
                id="btn-confirmar-aprobar"
                className={styles.btnAprobarLg}
                disabled={accionando}
                onClick={() => onConfirmarAprobacion(detalle)}
              >
                {accionando ? 'Procesando...' : 'Sí, aprobar'}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.detalleActions}>
            <button
              type="button"
              id="btn-panel-aprobar"
              className={styles.btnAprobarLg}
              disabled={accionando}
              onClick={onPedirConfirmacion}
            >
              Aprobar solicitud
            </button>
            <button
              type="button"
              id="btn-panel-rechazar"
              className={styles.btnRechazarLg}
              disabled={accionando}
              onClick={() => onAbrirRechazo(detalle)}
            >
              Rechazar solicitud
            </button>
          </div>
        )
      )}
    </>
  );
}
