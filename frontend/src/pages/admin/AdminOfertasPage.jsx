/**
 * AdminOfertasPage.jsx — Moderación post-publicación de ofertas.
 *
 * Dos ejes independientes (RBAC-04 — antes mezclados en `estado`+`moderada`):
 *   - Moderación (estadoModeracion): pendiente | aprobada | rechazada | auto_aprobada.
 *     Acciones: aprobar, rechazar.
 *   - Ciclo de vida (estado): activa | pausada | cerrada.
 *     Acciones del admin: pausar, cerrar (nunca "activar" — eso es de la empresa).
 * Las dos acciones de moderación y las dos de ciclo de vida nunca tocan el
 * campo del otro eje (ver adminModeracion.service.js en el backend).
 *
 * Sección 1: Ofertas pendientes de revisión (estadoModeracion=pendiente).
 * Sección 2: Historial de todas las ofertas con filtros por estado y por moderación.
 *
 * Ruta: /admin/ofertas
 * Rol: admin
 */

import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../services/api';
import Paginacion from '../../components/Paginacion/Paginacion';
import TableResponsive from '../../components/ui/TableResponsive';
import styles from './AdminOfertasPage.module.css';

const ESTADO_COLOR = {
  activa:  '#27ae60',
  pausada: '#e67e22',
  cerrada: '#7f8c8d',
};
const ESTADO_LABEL = {
  activa:  'Activa',
  pausada: 'Pausada',
  cerrada: 'Cerrada',
};
const FILTROS_ESTADO = ['todas', 'activa', 'pausada', 'cerrada'];

const MODERACION_COLOR = {
  pendiente:      '#3498db',
  aprobada:       '#27ae60',
  auto_aprobada:  '#16a085',
  rechazada:      '#e74c3c',
};
const MODERACION_LABEL = {
  pendiente:      'Pendiente de revisión',
  aprobada:       'Aprobada',
  auto_aprobada:  'Publicación automática',
  rechazada:      'Rechazada',
};
const FILTROS_MODERACION = ['todas', 'pendiente', 'aprobada', 'rechazada', 'auto_aprobada'];

// Transiciones válidas — mismas reglas que el backend (adminModeracion.service.js
// / oferta.service.js::TRANSICIONES_ESTADO) — solo para no ofrecer un botón que
// el servidor va a rechazar; la autoridad real sigue siendo el backend.
const TRANSICIONES_MODERACION = {
  pendiente:     ['aprobada', 'rechazada'],
  auto_aprobada: ['rechazada'],
  aprobada:      ['rechazada'],
  rechazada:     [],
};
const puedeAprobar  = (o) => (TRANSICIONES_MODERACION[o.estadoModeracion] || []).includes('aprobada');
const puedeRechazar = (o) => (TRANSICIONES_MODERACION[o.estadoModeracion] || []).includes('rechazada');
const puedePausar   = (o) => o.estado === 'activa';
const puedeCerrar   = (o) => o.estado === 'activa' || o.estado === 'pausada';

export default function AdminOfertasPage() {
  const [pendientes,   setPendientes]   = useState([]);
  const [todas,        setTodas]        = useState([]);
  const [paginationHist, setPaginationHist] = useState(null);
  const [pageHist,     setPageHist]     = useState(1);
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [filtroModeracion, setFiltroModeracion] = useState('todas');
  const [loading,      setLoading]      = useState(true);
  const [loadingHist,  setLoadingHist]  = useState(true);
  const [accionando,   setAccionando]   = useState(null);
  const [error,        setError]        = useState('');
  const [mensaje,      setMensaje]      = useState('');

  const cargarPendientes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.getOfertasPendientes();
      setPendientes(res.data?.data ?? []);
    } catch {
      setError('Error al cargar ofertas pendientes.');
    } finally {
      setLoading(false);
    }
  }, []);

  const cargarTodas = useCallback(async (estado, estadoModeracion, pagina = 1) => {
    setLoadingHist(true);
    try {
      const params = { page: pagina, limit: 25 };
      if (estado && estado !== 'todas') params.estado = estado;
      if (estadoModeracion && estadoModeracion !== 'todas') params.estadoModeracion = estadoModeracion;
      const res = await adminService.getTodasOfertas(params);
      setTodas(res.data?.data ?? []);
      setPaginationHist(res.data?.pagination ?? null);
      setPageHist(pagina);
    } catch {
      // silencioso — el historial es secundario
    } finally {
      setLoadingHist(false);
    }
  }, []);

  useEffect(() => { cargarPendientes(); }, [cargarPendientes]);
  useEffect(() => { cargarTodas(filtroEstado, filtroModeracion, 1); }, [filtroEstado, filtroModeracion, cargarTodas]);

  const handleAccion = async (id, accion) => {
    setAccionando(id);
    setError('');
    setMensaje('');
    try {
      await adminService.moderarOferta(id, accion);
      const labels = { aprobar: 'aprobada', pausar: 'pausada', rechazar: 'rechazada', cerrar: 'cerrada' };
      setMensaje(`Oferta ${labels[accion]} correctamente.`);
      // Quitar de pendientes solo si la acción resolvió la moderación —
      // pausar/cerrar no cambian estadoModeracion, la oferta sigue pendiente.
      if (accion === 'aprobar' || accion === 'rechazar') {
        setPendientes((prev) => prev.filter((o) => o.id !== id));
      }
      // Refrescar historial (misma página)
      cargarTodas(filtroEstado, filtroModeracion, pageHist);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al moderar la oferta.');
    } finally {
      setAccionando(null);
    }
  };

  const ofertasFiltradas = todas;

  return (
    <div className="page-container">

      {/* ── Cabecera ── */}
      <div className="dashboard-header">
        <h1>Moderación de Ofertas</h1>
        <span className={styles.headerCount}>
          {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''} de revisión
        </span>
      </div>

      {error   && <p className={`error-msg ${styles.feedback}`}>⚠️ {error}</p>}
      {mensaje && <p className={`success-msg ${styles.feedback}`}>✅ {mensaje}</p>}

      {/* ── Sección 1: Pendientes ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Pendientes de revisión</h2>

        {loading ? (
          <p className="msg">Cargando...</p>
        ) : pendientes.length === 0 ? (
          <div className={styles.emptyBox}>
            No hay ofertas pendientes de moderación.
          </div>
        ) : (
          <TableResponsive minWidth={760}>
              <thead>
                <tr>
                  <th>Oferta</th>
                  <th>Empresa</th>
                  <th>Área</th>
                  <th>Modalidad</th>
                  <th>Publicada</th>
                  <th>Estado actual</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((o) => (
                  <tr key={o.id} className={accionando === o.id ? styles.rowBusy : ''}>
                    <td>
                      <strong>{o.titulo}</strong>
                      <span className={styles.pendienteBadge}>⏳ Pendiente de revisión</span>
                    </td>
                    <td>{o.empresa?.razonSocial ?? '—'}</td>
                    <td>{o.area ?? '—'}</td>
                    <td>{o.modalidad ?? '—'}</td>
                    <td className={styles.fechaCell}>
                      {o.createdAt ? new Date(o.createdAt).toLocaleDateString('es-AR') : '—'}
                    </td>
                    <td>
                      <span className="badge" style={{ background: ESTADO_COLOR[o.estado] ?? '#7f8c8d' }}>
                        {ESTADO_LABEL[o.estado] ?? o.estado}
                      </span>
                    </td>
                    <td>
                      {accionando === o.id ? (
                        <span className={styles.procesando}>Procesando...</span>
                      ) : (
                        <div className={styles.acciones}>
                          <button
                            className={`btn-ok ${styles.btnSm}`}
                            onClick={() => handleAccion(o.id, 'aprobar')}
                            title="Aprobar: la oferta queda visible para los alumnos (si además está activa)"
                          >
                            ✅ Aprobar
                          </button>
                          <button
                            className={`btn-warn ${styles.btnSm}`}
                            onClick={() => handleAccion(o.id, 'pausar')}
                            title="Pausar: cambia el ciclo de vida de la publicación, no resuelve la moderación"
                          >
                            ⏸️ Pausar
                          </button>
                          <button
                            className={`btn-danger ${styles.btnSm}`}
                            onClick={() => handleAccion(o.id, 'rechazar')}
                            title="Rechazar: la empresa es notificada"
                          >
                            ❌ Rechazar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
          </TableResponsive>
        )}
      </section>

      {/* ── Sección 2: Historial por estado / moderación ── */}
      <section>
        <div className={styles.histHead}>
          <h2>Historial de ofertas</h2>
          <div className={styles.histFiltros}>
            {FILTROS_ESTADO.map((f) => {
              const activo = filtroEstado === f;
              const color = ESTADO_COLOR[f] ?? 'var(--primary)';
              return (
                <button
                  key={f}
                  onClick={() => setFiltroEstado(f)}
                  className={`${styles.histFiltro} ${activo ? styles.histFiltroActivo : ''}`}
                  style={activo ? { background: color, borderColor: color } : undefined}
                  aria-pressed={activo}
                >
                  {f === 'todas' ? 'Todas' : ESTADO_LABEL[f]}
                </button>
              );
            })}
          </div>
          <div className={styles.histFiltros}>
            {FILTROS_MODERACION.map((f) => {
              const activo = filtroModeracion === f;
              const color = MODERACION_COLOR[f] ?? 'var(--primary)';
              return (
                <button
                  key={f}
                  onClick={() => setFiltroModeracion(f)}
                  className={`${styles.histFiltro} ${activo ? styles.histFiltroActivo : ''}`}
                  style={activo ? { background: color, borderColor: color } : undefined}
                  aria-pressed={activo}
                >
                  {f === 'todas' ? 'Toda moderación' : MODERACION_LABEL[f]}
                </button>
              );
            })}
          </div>
          <span className={styles.histCount}>
            {loadingHist ? '...' : `${paginationHist?.total ?? ofertasFiltradas.length} resultado${(paginationHist?.total ?? ofertasFiltradas.length) !== 1 ? 's' : ''}`}
          </span>
        </div>

        {loadingHist ? (
          <p className="msg">Cargando historial...</p>
        ) : ofertasFiltradas.length === 0 ? (
          <div className={styles.emptyBox}>
            No hay ofertas para el filtro seleccionado.
          </div>
        ) : (
          <TableResponsive minWidth={860}>
              <thead>
                <tr>
                  <th>Oferta</th>
                  <th>Empresa</th>
                  <th>Área</th>
                  <th>Modalidad</th>
                  <th>Estado</th>
                  <th>Moderación</th>
                  <th>Publicada</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ofertasFiltradas.map((o) => (
                  <tr key={o.id} className={accionando === o.id ? styles.rowBusy : ''}>
                    <td>
                      <strong>{o.titulo}</strong>
                    </td>
                    <td>{o.empresa?.razonSocial ?? '—'}</td>
                    <td>{o.area ?? '—'}</td>
                    <td>{o.modalidad ?? '—'}</td>
                    <td>
                      <span className="badge" style={{ background: ESTADO_COLOR[o.estado] ?? '#7f8c8d' }}>
                        {ESTADO_LABEL[o.estado] ?? o.estado}
                      </span>
                    </td>
                    <td>
                      <span className="badge" style={{ background: MODERACION_COLOR[o.estadoModeracion] ?? '#7f8c8d' }}>
                        {MODERACION_LABEL[o.estadoModeracion] ?? o.estadoModeracion}
                      </span>
                    </td>
                    <td className={styles.fechaCell}>
                      {o.createdAt ? new Date(o.createdAt).toLocaleDateString('es-AR') : '—'}
                    </td>
                    <td>
                      {accionando === o.id ? (
                        <span className={styles.procesando}>Procesando...</span>
                      ) : (
                        <div className={styles.acciones}>
                          {puedeAprobar(o) && (
                            <button
                              className={`btn-ok ${styles.btnXs}`}
                              onClick={() => handleAccion(o.id, 'aprobar')}
                            >
                              Aprobar
                            </button>
                          )}
                          {puedeRechazar(o) && (
                            <button
                              className={`btn-danger ${styles.btnXs}`}
                              onClick={() => handleAccion(o.id, 'rechazar')}
                            >
                              Rechazar
                            </button>
                          )}
                          {puedePausar(o) && (
                            <button
                              className={`btn-warn ${styles.btnXs}`}
                              onClick={() => handleAccion(o.id, 'pausar')}
                            >
                              Pausar
                            </button>
                          )}
                          {puedeCerrar(o) && (
                            <button
                              className={`btn-secondary ${styles.btnXs}`}
                              onClick={() => handleAccion(o.id, 'cerrar')}
                            >
                              Cerrar
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
          </TableResponsive>
        )}

        {!loadingHist && (
          <Paginacion
            pagination={paginationHist}
            onPageChange={(p) => cargarTodas(filtroEstado, filtroModeracion, p)}
          />
        )}
      </section>
    </div>
  );
}
