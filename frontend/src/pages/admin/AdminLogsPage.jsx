/**
 * AdminLogsPage.jsx — Visor de logs de auditoría del sistema.
 *
 * Muestra todas las acciones registradas en activity_logs:
 * - Filtros por tipo de acción, entidad, rango de fechas
 * - Paginación de 25 registros por página
 * - Badge de colores por tipo de acción
 * - Exportación a CSV
 */

import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../services/api';
import Paginacion from '../../components/Paginacion/Paginacion';
import PageHeader from '../../components/ui/PageHeader';
import ExportMenu from '../../components/ui/ExportMenu';
import { descargarBlob, nombreDesdeContentDisposition } from '../../utils/csv';
import styles from './AdminLogsPage.module.css';

/* Tipos de acción con etiqueta y color */
const ACCIONES = {
  login:                    { label: 'Login',              color: '#0073AD', icon: '🔑' },
  logout:                   { label: 'Logout',             color: '#7f8c8d', icon: '🚪' },
  crear_usuario:            { label: 'Crear usuario',      color: '#27ae60', icon: '👤+' },
  editar_usuario:           { label: 'Editar usuario',     color: '#2980b9', icon: '✏️' },
  eliminar_usuario:         { label: 'Eliminar usuario',   color: '#c0392b', icon: '🗑️' },
  cambiar_rol:              { label: 'Cambiar rol',        color: '#8e44ad', icon: '🔄' },
  toggle_usuario:           { label: 'Toggle cuenta',      color: '#e67e22', icon: '⚡' },
  aprobar_empresa:          { label: 'Aprobar empresa',    color: '#27ae60', icon: '✅' },
  rechazar_empresa:         { label: 'Rechazar empresa',   color: '#c0392b', icon: '❌' },
  aprobar_oferta:           { label: 'Aprobar oferta',     color: '#27ae60', icon: '📢' },
  rechazar_oferta:          { label: 'Rechazar oferta',    color: '#c0392b', icon: '🚫' },
  crear_oferta:             { label: 'Nueva oferta',       color: '#0073AD', icon: '📝' },
  pausar_oferta:            { label: 'Pausar oferta',      color: '#e67e22', icon: '⏸️' },
  reactivar_oferta:         { label: 'Reactivar oferta',   color: '#27ae60', icon: '▶️' },
  cerrar_oferta:            { label: 'Cerrar oferta',      color: '#7f8c8d', icon: '🔒' },
  postular:                 { label: 'Postulación',        color: '#16a085', icon: '📋' },
  cambiar_estado_postulacion: { label: 'Estado postulación', color: '#8e44ad', icon: '🔃' },
  importar_alumnos_csv:     { label: 'Importar CSV',       color: '#2980b9', icon: '📥' },
  exportar_logs:            { label: 'Exportar auditoría', color: '#8e44ad', icon: '⬇️' },
  exportar_estadisticas:    { label: 'Exportar estadísticas', color: '#8e44ad', icon: '⬇️' },
  sistema:                  { label: 'Sistema',            color: '#7f8c8d', icon: '⚙️' },
};

export default function AdminLogsPage() {
  const [logs,        setLogs]       = useState([]);
  const [loading,     setLoading]    = useState(true);
  const [error,       setError]      = useState('');

  // Paginación (contrato común: { page, limit, total, totalPages })
  const [pagination, setPagination] = useState(null);

  // Filtros
  const [filtroAccion, setFiltroAccion] = useState('');
  const [filtroEntidad, setFiltroEntidad] = useState('');
  const [desde,        setDesde]       = useState('');
  const [hasta,        setHasta]       = useState('');

  /* ── Carga ───────────────────────────────────────────────────── */
  const cargar = useCallback(async (p = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = { page: p, limit: 25 };
      if (filtroAccion)  params.accion  = filtroAccion;
      if (filtroEntidad) params.entidad = filtroEntidad;
      if (desde)         params.desde   = desde;
      if (hasta)         params.hasta   = hasta;

      const res = await adminService.getLogs(params);
      setLogs(res.data.data ?? []);
      setPagination(res.data.pagination ?? null);
    } catch {
      setError('No se pudieron cargar los logs del sistema.');
    } finally {
      setLoading(false);
    }
  }, [filtroAccion, filtroEntidad, desde, hasta]);

  useEffect(() => { cargar(1); }, [cargar]);

  /* ── Exportar (CSV / Excel / PDF) ────────────────────────────── */
  const handleExport = async (format) => {
    try {
      const params = { format };
      if (filtroAccion)  params.accion  = filtroAccion;
      if (filtroEntidad) params.entidad = filtroEntidad;
      if (desde)         params.desde   = desde;
      if (hasta)         params.hasta   = hasta;

      const res = await adminService.exportarLogs(params);
      const fallback = `logs-${new Date().toISOString().slice(0, 10)}.${format}`;
      const nombre = nombreDesdeContentDisposition(res.headers['content-disposition'], fallback);
      descargarBlob(res.data, nombre);
    } catch {
      setError('Error al exportar los logs.');
    }
  };

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="page-container">
      {/* Cabecera */}
      <PageHeader
        title="Historial de Accesos"
        subtitle={loading ? '...' : `${pagination?.total ?? 0} registro${(pagination?.total ?? 0) !== 1 ? 's' : ''} encontrado${(pagination?.total ?? 0) !== 1 ? 's' : ''}`}
        actions={<ExportMenu id="btn-exportar-logs" formats={['csv', 'xlsx', 'pdf']} onExport={handleExport} />}
      />

      {error && <p className="error-msg" style={{ marginBottom: '1rem' }}>{error}</p>}

      {/* Filtros */}
      <div className={styles.filtros}>
        <select id="filtro-accion" className={styles.filterSelect} value={filtroAccion} onChange={(e) => setFiltroAccion(e.target.value)}>
          <option value="">Todas las acciones</option>
          {Object.entries(ACCIONES).map(([key, val]) => (
            <option key={key} value={key}>{val.icon} {val.label}</option>
          ))}
        </select>

        <select id="filtro-entidad" className={styles.filterSelect} value={filtroEntidad} onChange={(e) => setFiltroEntidad(e.target.value)}>
          <option value="">Todas las entidades</option>
          {['usuario', 'empresa', 'oferta', 'postulacion', 'activity_log', 'estadisticas'].map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>

        <div className={styles.dateGroup}>
          <label>Desde</label>
          <input type="date" className={styles.dateInput} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>

        <div className={styles.dateGroup}>
          <label>Hasta</label>
          <input type="date" className={styles.dateInput} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>

        <button className="btn-secondary" onClick={() => cargar(1)}>↺ Filtrar</button>
        <button className={styles.clearBtn} onClick={() => { setFiltroAccion(''); setFiltroEntidad(''); setDesde(''); setHasta(''); }}>
          ✕ Limpiar
        </button>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} />
          <p className="msg">Cargando logs...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className={styles.empty}>
          <span>📋</span>
          <p>No hay registros con los filtros actuales.</p>
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Fecha / Hora</th>
                  <th>Acción</th>
                  <th>Entidad</th>
                  <th>Usuario responsable</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const def = ACCIONES[log.accion] ?? { label: log.accion, color: '#7f8c8d', icon: '•' };
                  return (
                    <tr key={log.id}>
                      <td className={styles.idCell}>#{log.id}</td>
                      <td className={styles.fechaCell}>
                        <span>{new Date(log.createdAt).toLocaleDateString('es-AR')}</span>
                        <small>{new Date(log.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small>
                      </td>
                      <td>
                        <span className={styles.accionBadge} style={{ '--badge-color': def.color }}>
                          {def.icon} {def.label}
                        </span>
                      </td>
                      <td>
                        {log.entidad && (
                          <span className={styles.entidadTag}>
                            {log.entidad}{log.entidadId ? ` #${log.entidadId}` : ''}
                          </span>
                        )}
                      </td>
                      <td>
                        {log.usuario ? (
                          <div className={styles.userCell}>
                            <span className={styles.avatar}>
                              {log.usuario.nombre?.[0]}{log.usuario.apellido?.[0]}
                            </span>
                            <div>
                              <span>{log.usuario.nombre} {log.usuario.apellido}</span>
                              <small className={styles.email}>{log.usuario.email}</small>
                            </div>
                          </div>
                        ) : (
                          <span className={styles.sistema}>⚙️ Sistema</span>
                        )}
                      </td>
                      <td className={styles.ipCell}>{log.ip || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Paginacion pagination={pagination} onPageChange={cargar} />
        </>
      )}
    </div>
  );
}
