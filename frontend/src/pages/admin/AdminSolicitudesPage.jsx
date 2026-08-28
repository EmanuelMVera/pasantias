/**
 * AdminSolicitudesPage.jsx — Gestión de solicitudes de registro de empresa.
 *
 * Permite al administrador:
 *  - Ver todas las solicitudes con filtro por estado
 *  - Ver el detalle completo de cada solicitud en un panel lateral
 *  - Aprobar (crea empresa + usuario + envía credenciales por email)
 *  - Rechazar (con motivo opcional + email de notificación)
 *
 * Ruta: /admin/solicitudes
 * Acceso: solo rol 'admin'
 */

import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../services/api';
import Modal from '../../components/Modal/Modal';
import Paginacion from '../../components/Paginacion/Paginacion';
import styles from './AdminSolicitudesPage.module.css';

const sumar = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

// ── Helpers de UI ─────────────────────────────────────────────────────────────
const ESTADO_CONFIG = {
  pendiente: { label: 'Pendiente', color: '#e67e22', bg: '#fef3e2', icon: '🕐' },
  aprobado:  { label: 'Aprobado',  color: '#27ae60', bg: '#e8f8f0', icon: '✅' },
  rechazado: { label: 'Rechazado', color: '#c0392b', bg: '#fdecea', icon: '❌' },
};

function EstadoBadge({ estado }) {
  const cfg = ESTADO_CONFIG[estado] ?? { label: estado, color: '#666', bg: '#eee', icon: '❓' };
  return (
    <span
      className={styles.estadoBadge}
      style={{ color: cfg.color, background: cfg.bg }}
    >
      {cfg.icon} {cfg.label}
    </span>
  );
}

function formatFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function AdminSolicitudesPage() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');
  const [filtroEstado, setFiltroEstado] = useState(''); // '' | 'pendiente' | 'aprobado' | 'rechazado'
  const [paginationEmp, setPaginationEmp] = useState(null);
  const [conteoEmp,     setConteoEmp]     = useState({});
  const [pageEmp,       setPageEmp]       = useState(1);

  // Panel de detalle / acción
  const [detalle,    setDetalle]    = useState(null); // solicitud seleccionada
  const [accionando, setAccionando] = useState(false);
  const [confirmando, setConfirmando] = useState(null); // id de solicitud en confirmación de aprobación

  // Modal de rechazo (para ingresar el motivo)
  const [modalRechazo, setModalRechazo] = useState(false);
  const [motivo,       setMotivo]       = useState('');

  // ── Estado: solicitudes de reclutadores (sección 2) ────────────────────────────────
  const [solicitudesRecl,    setSolicitudesRecl]    = useState([]);
  const [loadingRecl,        setLoadingRecl]        = useState(true);
  const [filtroRecl,         setFiltroRecl]         = useState('');
  const [paginationRecl,     setPaginationRecl]     = useState(null);
  const [conteoRecl,         setConteoRecl]         = useState({});
  const [pageRecl,           setPageRecl]           = useState(1);
  const [confirmandoRecl,    setConfirmandoRecl]    = useState(null);
  const [accionandoRecl,     setAccionandoRecl]     = useState(false);
  const [modalRechazoRecl,   setModalRechazoRecl]   = useState(false);
  const [detalleRecl,        setDetalleRecl]        = useState(null);
  const [motivoRecl,         setMotivoRecl]         = useState('');

  // ── Carga de datos ──────────────────────────────────────────────────
  const cargar = useCallback(async (pagina = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = { page: pagina, limit: 25 };
      if (filtroEstado) params.estado = filtroEstado;
      const res = await adminService.getSolicitudesEmpresa(params);
      setSolicitudes(res.data.data ?? []);
      setPaginationEmp(res.data.pagination ?? null);
      setConteoEmp(res.data.conteoPorEstado ?? {});
      setPageEmp(pagina);
    } catch {
      setError('No se pudieron cargar las solicitudes.');
    } finally {
      setLoading(false);
    }
  }, [filtroEstado]);

  const cargarRecl = useCallback(async (pagina = 1) => {
    setLoadingRecl(true);
    try {
      const params = { page: pagina, limit: 25 };
      if (filtroRecl) params.estado = filtroRecl;
      const res = await adminService.getSolicitudesReclutador(params);
      setSolicitudesRecl(res.data.data ?? []);
      setPaginationRecl(res.data.pagination ?? null);
      setConteoRecl(res.data.conteoPorEstado ?? {});
      setPageRecl(pagina);
    } catch {
      // falla silenciosa — la sección muestra vacío
    } finally {
      setLoadingRecl(false);
    }
  }, [filtroRecl]);

  useEffect(() => { cargar(1);     }, [cargar]);
  useEffect(() => { cargarRecl(1); }, [cargarRecl]);

  // ── Helpers de toast ────────────────────────────────────────────────────────
  const showSuccess = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 4000);
  };

  // ── Aprobar solicitud ───────────────────────────────────────────────────────
  const handleAprobar = async (solicitud) => {
    if (confirmando !== solicitud.id) {
      setConfirmando(solicitud.id);
      return;
    }
    setConfirmando(null);
    setAccionando(true);
    setError('');
    try {
      const res = await adminService.aprobarSolicitud(solicitud.id);
      const { data } = res.data;
      const emailDestino = solicitud.responsableEmail || solicitud.email;
      showSuccess(
        `✅ "${solicitud.razonSocial}" aprobada. Credenciales enviadas a ${emailDestino}` +
        (data?.passwordGenerada ? ` (pwd dev: ${data.passwordGenerada})` : '') +
        (data?.reclutadoresPendientes ? ` · ${data.reclutadoresPendientes} solicitud(es) de reclutador creadas.` : '')
      );
      setDetalle(null);
      cargar(pageEmp);
    } catch (err) {
      const msg = err.response?.data?.message ?? 'Error al aprobar la solicitud.';
      setError(msg);
    } finally {
      setAccionando(false);
    }
  };

  // ── Rechazar solicitud ──────────────────────────────────────────────────
  const abrirRechazo = (solicitud) => {
    setDetalle(solicitud);
    setMotivo('');
    setModalRechazo(true);
  };

  const handleRechazar = async () => {
    if (!detalle) return;
    setAccionando(true);
    try {
      await adminService.rechazarSolicitud(detalle.id, motivo.trim() || undefined);
      showSuccess(`❌ Solicitud de "${detalle.razonSocial}" rechazada. Notificación enviada.`);
      setModalRechazo(false);
      setDetalle(null);
      cargar(pageEmp);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al rechazar la solicitud.');
      setModalRechazo(false);
    } finally {
      setAccionando(false);
    }
  };

  // ── Handlers: solicitudes de reclutadores ──────────────────────────────────────
  const handleAprobarRecl = async (sol) => {
    if (confirmandoRecl !== sol.id) { setConfirmandoRecl(sol.id); return; }
    setConfirmandoRecl(null);
    setAccionandoRecl(true);
    try {
      const res = await adminService.aprobarSolicitudReclutador(sol.id);
      const { data } = res.data;
      showSuccess(
        `✅ Reclutador "${sol.nombre}" aprobado. Credenciales enviadas a ${sol.email}` +
        (data?.passwordGenerada ? ` (pwd dev: ${data.passwordGenerada})` : '')
      );
      cargarRecl(pageRecl);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al aprobar.');
    } finally {
      setAccionandoRecl(false);
    }
  };

  const handleRechazarRecl = async () => {
    if (!detalleRecl) return;
    setAccionandoRecl(true);
    try {
      await adminService.rechazarSolicitudReclutador(detalleRecl.id, motivoRecl.trim() || undefined);
      showSuccess(`❌ Solicitud de "${detalleRecl.nombre}" rechazada. Notificación enviada a la empresa.`);
      setModalRechazoRecl(false);
      setDetalleRecl(null);
      cargarRecl(pageRecl);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al rechazar.');
      setModalRechazoRecl(false);
    } finally {
      setAccionandoRecl(false);
    }
  };

  // ── Estadísticas rápidas (del sidecar conteoPorEstado, sobre TODO el set) ──
  const stats = {
    total:     sumar(conteoEmp),
    pendiente: conteoEmp.pendiente ?? 0,
    aprobado:  conteoEmp.aprobado  ?? 0,
    rechazado: conteoEmp.rechazado ?? 0,
  };
  const statsRecl = {
    total:     sumar(conteoRecl),
    pendiente: conteoRecl.pendiente ?? 0,
    aprobado:  conteoRecl.aprobado  ?? 0,
    rechazado: conteoRecl.rechazado ?? 0,
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page-container">

      {/* ── Cabecera ── */}
      <div className="dashboard-header">
        <div>
          <h1>📋 Solicitudes de Empresa</h1>
          <p className={styles.subtitle}>
            Revisá, aprobá o rechazá las solicitudes de registro de nuevas empresas.
          </p>
        </div>
        <button className="btn-secondary" onClick={cargar} disabled={loading}>
          ↺ Actualizar
        </button>
      </div>

      {/* ── Mensajes ── */}
      {error   && <p className="error-msg" style={{ marginBottom: '1rem' }}>{error}</p>}
      {success && <div className={styles.successToast}>{success}</div>}

      {/* ── Tarjetas de resumen ── */}
      <div className={styles.statsRow}>
        {[
          { label: 'Total',     value: stats.total,     color: '#0073AD' },
          { label: 'Pendientes', value: stats.pendiente, color: '#e67e22' },
          { label: 'Aprobadas', value: stats.aprobado,  color: '#27ae60' },
          { label: 'Rechazadas', value: stats.rechazado, color: '#c0392b' },
        ].map(({ label, value, color }) => (
          <div key={label} className={styles.statCard} style={{ '--stat-color': color }}>
            <span className={styles.statValue}>{value}</span>
            <span className={styles.statLabel}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Filtros ── */}
      <div className={styles.filtros}>
        <span className={styles.filtroLabel}>Filtrar por estado:</span>
        {['', 'pendiente', 'aprobado', 'rechazado'].map(est => (
          <button
            key={est}
            id={`filtro-${est || 'todos'}`}
            className={`${styles.filtroBtn} ${filtroEstado === est ? styles.filtroBtnActive : ''}`}
            onClick={() => setFiltroEstado(est)}
          >
            {est === '' ? 'Todos' : ESTADO_CONFIG[est]?.label}
          </button>
        ))}
      </div>

      {/* ── Layout principal: tabla + panel detalle ── */}
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
                        onClick={() => setDetalle(s)}
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
                        <td><EstadoBadge estado={s.estado} /></td>
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
                                    onClick={() => handleAprobar(s)}
                                  >
                                    {accionando ? 'Procesando...' : '✅ Sí, aprobar'}
                                  </button>
                                  <button
                                    className={styles.btnRechazar}
                                    onClick={() => setConfirmando(null)}
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
                                    onClick={() => handleAprobar(s)}
                                    title="Aprobar solicitud"
                                  >
                                    ✅ Aprobar
                                  </button>
                                  <button
                                    id={`btn-rechazar-${s.id}`}
                                    className={styles.btnRechazar}
                                    disabled={accionando}
                                    onClick={() => abrirRechazo(s)}
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
            <Paginacion pagination={paginationEmp} onPageChange={cargar} />
          )}
        </div>

        {/* ── Panel de detalle ── */}
        {detalle && (
          <aside className={styles.detallePanel}>
            <div className={styles.detallePanelHeader}>
              <h3>Detalle de solicitud</h3>
              <button className={styles.cerrarDetalle} onClick={() => setDetalle(null)}>✕</button>
            </div>

            <div className={styles.detalleSection}>
              <EstadoBadge estado={detalle.estado} />
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
                  <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '0.5rem' }}>
                    Al aprobar esta solicitud se crearán como solicitudes de reclutador pendientes.
                  </p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {recls.map((r, i) => (
                      <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', background: '#f0f6fc', borderRadius: '6px', padding: '6px 10px' }}>
                        <span style={{ fontWeight: 600 }}>
                          {[r.nombre, r.apellido].filter(Boolean).join(' ')}
                        </span>
                        <span style={{ color: '#64748b' }}>·</span>
                        <a href={`mailto:${r.email}`} style={{ color: '#0073AD' }}>{r.email}</a>
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
                  onClick={() => handleAprobar(detalle)}
                >
                  {accionando ? 'Procesando...' : '✅ Aprobar solicitud'}
                </button>
                <button
                  id="btn-panel-rechazar"
                  className={styles.btnRechazarLg}
                  disabled={accionando}
                  onClick={() => abrirRechazo(detalle)}
                >
                  ❌ Rechazar solicitud
                </button>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* ── Modal de rechazo (empresas) ── */}
      {modalRechazo && detalle && (
        <Modal title="❌ Rechazar solicitud" onClose={() => setModalRechazo(false)}>
            <p className={styles.modalBody}>
              Vas a rechazar la solicitud de <strong>{detalle.razonSocial}</strong>.
              Se enviará un email de notificación a{' '}
              <strong>{detalle.responsableEmail || detalle.email}</strong>.
            </p>
            <div className="form-group">
              <label htmlFor="motivo-rechazo">
                Motivo del rechazo <span className={styles.opcional}>(opcional)</span>
              </label>
              <textarea
                id="motivo-rechazo"
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Explicá brevemente por qué se rechaza la solicitud."
                rows={4}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>
            <div className={styles.modalFooter}>
              <button className="btn-secondary" onClick={() => setModalRechazo(false)} disabled={accionando}>Cancelar</button>
              <button id="btn-confirmar-rechazo" className={styles.btnRechazarLg} onClick={handleRechazar} disabled={accionando}>
                {accionando ? 'Rechazando...' : 'Confirmar rechazo'}
              </button>
            </div>
        </Modal>
      )}

      {/* ──────────────────────────────────────────────── */}
      {/* ── SECCIÓN 2: Solicitudes de Reclutadores ── */}
      {/* ──────────────────────────────────────────────── */}
      <div style={{ marginTop: '3rem' }}>
        <div className="dashboard-header" style={{ marginBottom: '1.25rem' }}>
          <div>
            <h2>👤 Solicitudes de Reclutadores</h2>
            <p className={styles.subtitle}>
              Alta de reclutadores solicitada por empresas ya registradas.
            </p>
          </div>
          <button className="btn-secondary" onClick={cargarRecl} disabled={loadingRecl}>↺ Actualizar</button>
        </div>

        {/* Stats reclutadores */}
        <div className={styles.statsRow} style={{ marginBottom: '1rem' }}>
          {[
            { label: 'Total',      value: statsRecl.total,     color: '#0073AD' },
            { label: 'Pendientes', value: statsRecl.pendiente, color: '#e67e22' },
            { label: 'Aprobados',  value: statsRecl.aprobado,  color: '#27ae60' },
            { label: 'Rechazados', value: statsRecl.rechazado, color: '#c0392b' },
          ].map(({ label, value, color }) => (
            <div key={label} className={styles.statCard} style={{ '--stat-color': color }}>
              <span className={styles.statValue}>{value}</span>
              <span className={styles.statLabel}>{label}</span>
            </div>
          ))}
        </div>

        {/* Filtros reclutadores */}
        <div className={styles.filtros} style={{ marginBottom: '1rem' }}>
          <span className={styles.filtroLabel}>Filtrar:</span>
          {['', 'pendiente', 'aprobado', 'rechazado'].map(est => (
            <button
              key={est}
              className={`${styles.filtroBtn} ${filtroRecl === est ? styles.filtroBtnActive : ''}`}
              onClick={() => setFiltroRecl(est)}
            >
              {est === '' ? 'Todos' : ESTADO_CONFIG[est]?.label}
            </button>
          ))}
        </div>

        {/* Tabla reclutadores */}
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
                      <td><EstadoBadge estado={s.estado} /></td>
                      <td className={styles.fechaCell}>{formatFecha(s.createdAt)}</td>
                      <td onClick={e => e.stopPropagation()}>
                        {esPendiente ? (
                          <div className={styles.accionesBtns}>
                            {confirmandoRecl === s.id ? (
                              <>
                                <span style={{ fontSize: '0.78rem', color: '#e67e22', fontWeight: 600 }}>¿Confirmar?</span>
                                <button className={styles.btnAprobar} disabled={accionandoRecl} onClick={() => handleAprobarRecl(s)}>
                                  {accionandoRecl ? 'Procesando...' : '✅ Sí'}
                                </button>
                                <button className={styles.btnRechazar} onClick={() => setConfirmandoRecl(null)}>Cancelar</button>
                              </>
                            ) : (
                              <>
                                <button
                                  className={styles.btnAprobar}
                                  disabled={accionandoRecl}
                                  onClick={() => handleAprobarRecl(s)}
                                >✅ Aprobar</button>
                                <button
                                  className={styles.btnRechazar}
                                  disabled={accionandoRecl}
                                  onClick={() => { setDetalleRecl(s); setMotivoRecl(''); setModalRechazoRecl(true); }}
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
          <Paginacion pagination={paginationRecl} onPageChange={cargarRecl} />
        )}
      </div>

      {/* Modal de rechazo: reclutadores */}
      {modalRechazoRecl && detalleRecl && (
        <Modal title="❌ Rechazar solicitud de reclutador" onClose={() => setModalRechazoRecl(false)}>
            <p className={styles.modalBody}>
              Vas a rechazar la solicitud de <strong>{detalleRecl.nombre}</strong> ({detalleRecl.email}).
              Se enviará una notificación a la empresa propietaria.
            </p>
            <div className="form-group">
              <label htmlFor="motivo-rechazo-recl">
                Motivo <span className={styles.opcional}>(opcional)</span>
              </label>
              <textarea
                id="motivo-rechazo-recl"
                value={motivoRecl}
                onChange={e => setMotivoRecl(e.target.value)}
                placeholder="Razón del rechazo (se incluye en el email a la empresa)"
                rows={3}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>
            <div className={styles.modalFooter}>
              <button className="btn-secondary" onClick={() => setModalRechazoRecl(false)} disabled={accionandoRecl}>Cancelar</button>
              <button className={styles.btnRechazarLg} onClick={handleRechazarRecl} disabled={accionandoRecl}>
                {accionandoRecl ? 'Rechazando...' : 'Confirmar rechazo'}
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}
