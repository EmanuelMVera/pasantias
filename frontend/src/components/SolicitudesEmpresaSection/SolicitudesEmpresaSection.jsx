import EstadoSolicitudBadge from '../EstadoSolicitudBadge/EstadoSolicitudBadge';
import { formatFecha } from '../EstadoSolicitudBadge/estadoSolicitud.utils';
import Paginacion from '../Paginacion/Paginacion';
import styles from './SolicitudesEmpresaSection.module.css';

/**
 * SolicitudesEmpresaSection.jsx — tabla de solicitudes de empresa (con
 * confirmación inline de aprobación) + panel de detalle. Extraído de
 * AdminSolicitudesPage.jsx; el estado (detalle/confirmando/accionando) sigue
 * viviendo en la página, este componente solo recibe datos y callbacks.
 */
export default function SolicitudesEmpresaSection({
  solicitudes,
  loading,
  filtroEstado,
  detalle,
  onSelectDetalle,
  onCerrarDetalle,
  confirmando,
  onCancelarConfirmacion,
  accionando,
  onAprobar,
  onAbrirRechazo,
  paginationEmp,
  onPageChange,
}) {
  return (
    <div className={styles.layout}>

      {/* ── Lista de solicitudes ── */}
      <div className={styles.listPanel}>
        {loading ? (
          <div className={styles.loadingWrap}>
            <div className={styles.spinner} />
            <p className="msg">Cargando solicitudes...</p>
          </div>
        ) : solicitudes.length === 0 ? (
          <div className={styles.empty}>
            <span>📭</span>
            <p>No hay solicitudes {filtroEstado ? `con estado "${filtroEstado}"` : ''}.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Empresa</th>
                  <th>CUIT</th>
                  <th>Email</th>
                  <th>Carreras</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {solicitudes.map(s => {
                  const carreras = Array.isArray(s.carrerasInteres)
                    ? s.carrerasInteres
                    : (typeof s.carrerasInteres === 'string'
                        ? JSON.parse(s.carrerasInteres || '[]')
                        : []);
                  const esPendiente = s.estado === 'pendiente';
                  return (
                    <tr
                      key={s.id}
                      className={`${styles.fila} ${detalle?.id === s.id ? styles.filaActiva : ''}`}
                      onClick={() => onSelectDetalle(s)}
                      tabIndex={0}
                      aria-label={`Ver detalle de ${s.razonSocial}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectDetalle(s); }
                      }}
                    >
                      <td className={styles.idCell}>#{s.id}</td>
                      <td>
                        <div className={styles.empresaCell}>
                          <span className={styles.empresaAvatar}>
                            {s.razonSocial?.[0] ?? '?'}
                          </span>
                          <div>
                            <strong>{s.razonSocial}</strong>
                            {s.rubro && <small className={styles.rubro}>{s.rubro}</small>}
                          </div>
                        </div>
                      </td>
                      <td className={styles.cuitCell}>{s.cuit}</td>
                      <td className={styles.emailCell}>{s.email}</td>
                      <td>
                        <div className={styles.carrerasTags}>
                          {carreras.slice(0, 2).map(c => (
                            <span key={c} className={styles.carreraTag}>{c}</span>
                          ))}
                          {carreras.length > 2 && (
                            <span className={styles.carreraMas}>+{carreras.length - 2}</span>
                          )}
                          {carreras.length === 0 && <span className={styles.sinCarreras}>—</span>}
                        </div>
                      </td>
                      <td><EstadoSolicitudBadge estado={s.estado} /></td>
                      <td className={styles.fechaCell}>{formatFecha(s.createdAt)}</td>
                      <td onClick={e => e.stopPropagation()}>
                        {esPendiente ? (
                          <div className={styles.accionesBtns}>
                            {confirmando === s.id ? (
                              // Modo confirmación inline
                              <>
                                <span style={{ fontSize: '0.78rem', color: '#e67e22', fontWeight: 600 }}>¿Confirmar?</span>
                                <button
                                  className={styles.btnAprobar}
                                  disabled={accionando}
                                  onClick={() => onAprobar(s)}
                                >
                                  {accionando ? 'Procesando...' : '✅ Sí, aprobar'}
                                </button>
                                <button
                                  className={styles.btnRechazar}
                                  onClick={onCancelarConfirmacion}
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  id={`btn-aprobar-${s.id}`}
                                  className={styles.btnAprobar}
                                  disabled={accionando}
                                  onClick={() => onAprobar(s)}
                                  title="Aprobar solicitud"
                                >
                                  ✅ Aprobar
                                </button>
                                <button
                                  id={`btn-rechazar-${s.id}`}
                                  className={styles.btnRechazar}
                                  disabled={accionando}
                                  onClick={() => onAbrirRechazo(s)}
                                  title="Rechazar solicitud"
                                >
                                  ❌ Rechazar
                                </button>
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

        {!loading && (
          <Paginacion pagination={paginationEmp} onPageChange={onPageChange} />
        )}
      </div>

      {/* ── Panel de detalle ── */}
      {detalle && (
        <aside className={styles.detallePanel}>
          <div className={styles.detallePanelHeader}>
            <h3>Detalle de solicitud</h3>
            <button className={styles.cerrarDetalle} onClick={onCerrarDetalle}>✕</button>
          </div>

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
            <h4 className={styles.detalleSectionTitle}>👤 Responsable / Administrador</h4>
            {(detalle.responsableNombre || detalle.responsableEmail) ? (
              <dl className={styles.detalleDL}>
                <dt>Nombre</dt>
                <dd>
                  {[detalle.responsableNombre, detalle.responsableApellido].filter(Boolean).join(' ') || '—'}
                </dd>
                <dt>Email de acceso</dt>
                <dd>
                  <a href={`mailto:${detalle.responsableEmail}`}>{detalle.responsableEmail}</a>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '0.5rem' }}>
                    (recibirá las credenciales)
                  </span>
                </dd>
                {detalle.responsableCargo && (
                  <><dt>Cargo</dt><dd>{detalle.responsableCargo}</dd></>
                )}
                {detalle.responsableTelefono && (
                  <><dt>Teléfono</dt><dd>{detalle.responsableTelefono}</dd></>
                )}
              </dl>
            ) : (
              <p style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>
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

          {/* Carreras de interés */}
          {(() => {
            const carreras = Array.isArray(detalle.carrerasInteres)
              ? detalle.carrerasInteres
              : (typeof detalle.carrerasInteres === 'string'
                  ? JSON.parse(detalle.carrerasInteres || '[]')
                  : []);
            return carreras.length > 0 ? (
              <div className={styles.detalleSection}>
                <h4 className={styles.detalleSectionTitle}>Carreras de interés</h4>
                <div className={styles.carrerasDetalle}>
                  {carreras.map(c => (
                    <span key={c} className={styles.carreraTagDetalle}>{c}</span>
                  ))}
                </div>
              </div>
            ) : null;
          })()}

          {/* Reclutadores incluidos en la solicitud */}
          {(() => {
            const recls = Array.isArray(detalle.reclutadores)
              ? detalle.reclutadores.filter(r => r?.nombre && r?.email)
              : [];
            return recls.length > 0 ? (
              <div className={styles.detalleSection}>
                <h4 className={styles.detalleSectionTitle}>
                  👥 Reclutadores solicitados ({recls.length})
                </h4>
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
            ) : null;
          })()}

          {/* Botones de acción en el panel */}
          {detalle.estado === 'pendiente' && (
            <div className={styles.detalleActions}>
              <button
                id="btn-panel-aprobar"
                className={styles.btnAprobarLg}
                disabled={accionando}
                onClick={() => onAprobar(detalle)}
              >
                {accionando ? 'Procesando...' : '✅ Aprobar solicitud'}
              </button>
              <button
                id="btn-panel-rechazar"
                className={styles.btnRechazarLg}
                disabled={accionando}
                onClick={() => onAbrirRechazo(detalle)}
              >
                ❌ Rechazar solicitud
              </button>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
