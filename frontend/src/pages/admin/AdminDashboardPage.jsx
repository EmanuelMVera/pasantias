/**
 * AdminDashboardPage.jsx — Panel de Administración Institucional.
 *
 * Migrado al nuevo endpoint GET /api/admin/dashboard-general.
 * Con fallback al endpoint legacy GET /api/admin/stats si el nuevo falla.
 *
 * Muestra:
 *  - Tarjetas métricas: alumnos activos, empresas activas, contrataciones,
 *    postulaciones, tasa de inserción
 *  - Gráfico de barras con las métricas principales
 *  - Feed de actividad reciente del sistema
 *  - Sección de empresas pendientes de aprobación
 *  - Sección de ofertas pendientes de moderación
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { adminService } from '../../services/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import styles from './AdminDashboardPage.module.css';

/* Colores del gráfico (uno por barra) */
const CHART_COLORS = ['#0073AD', '#27ae60', '#8e44ad', '#e67e22', '#16a085'];

/* Íconos y colores para cada métrica del dashboard */
const METRIC_DEFS = [
  { key: 'alumnosActivos',  label: 'Alumnos Activos',   icon: '🎓', color: 'var(--primary)' },
  { key: 'empresasActivas', label: 'Empresas Activas',   icon: '🏢', color: '#1a5276' },
  { key: 'ofertasActivas',  label: 'Ofertas Activas',    icon: '📢', color: '#27ae60' },
  { key: 'postulaciones',   label: 'Postulaciones',      icon: '📋', color: '#8e44ad' },
  { key: 'contrataciones',  label: 'Contrataciones',     icon: '🤝', color: '#16a085' },
  { key: 'tasaInsercion',   label: 'Tasa de Inserción',  icon: '📈', color: 'var(--success)', highlight: true },
];

/** Feed de actividad reciente */
function ActividadFeed({ actividad }) {
  if (!actividad || actividad.length === 0) return (
    <p className="msg">No hay actividad reciente registrada.</p>
  );

  return (
    <div className={styles.actividadList}>
      {actividad.slice(0, 10).map((item, idx) => (
        <div key={idx} className={styles.actividadItem}>
          <span className={styles.actividadIcon}>{item.icono ?? '•'}</span>
          <div className={styles.actividadBody}>
            <span>{item.descripcion ?? item.mensaje ?? JSON.stringify(item)}</span>
            <span className={styles.actividadFecha}>
              {item.fecha ? new Date(item.fecha).toLocaleString('es-AR') : ''}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [stats,                setStats]               = useState(null);
  const [, setActividad]                               = useState([]);
  const [empresasPendientes,   setEmpresasPendientes]   = useState([]);
  const [reclutadoresPendientes, setReclutadoresPendientes] = useState([]);
  const [ofertasPendientes,    setOfertasPendientes]    = useState([]);
  const [loading,              setLoading]              = useState(true);
  const [error,                setError]                = useState('');

  const cargarDatos = async () => {
    setLoading(true);
    try {
      // Dashboard general + actividad + solicitudes empresa + solicitudes reclutador + ofertas en paralelo
      const [dashRes, actRes, epRes, rrRes, opRes] = await Promise.allSettled([
        adminService.getDashboardGeneral(),
        adminService.getActividadReciente(),
        adminService.getSolicitudesEmpresa({ estado: 'pendiente' }),
        adminService.getSolicitudesReclutador({ estado: 'pendiente' }),
        adminService.getOfertasPendientes(),
      ]);

      // Dashboard general (con fallback al endpoint legacy)
      if (dashRes.status === 'fulfilled') {
        setStats(dashRes.value.data.data ?? dashRes.value.data);
      } else {
        try {
          const legacyRes = await adminService.getStats();
          setStats(legacyRes.data.data ?? legacyRes.data);
        } catch {
          setError('No se pudo cargar el dashboard. Verificá la conexión con el servidor.');
        }
      }

      if (actRes.status === 'fulfilled') {
        setActividad(actRes.value.data.data ?? actRes.value.data ?? []);
      }
      if (epRes.status === 'fulfilled') {
        setEmpresasPendientes(epRes.value.data.data ?? epRes.value.data ?? []);
      }
      if (rrRes.status === 'fulfilled') {
        setReclutadoresPendientes(rrRes.value.data.data ?? rrRes.value.data ?? []);
      }
      if (opRes.status === 'fulfilled') {
        setOfertasPendientes(opRes.value.data.data ?? opRes.value.data ?? []);
      }
    } catch {
      setError('Error inesperado al cargar el panel.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarDatos(); }, []);

  // Aprobar/rechazar solicitudes de empresa (no empresas directas)
  const handleAprobarEmpresa = async (id) => {
    await adminService.aprobarSolicitud(id);
    setEmpresasPendientes((prev) => prev.filter((e) => e.id !== id));
  };
  const handleRechazarEmpresa = async (id) => {
    await adminService.rechazarSolicitud(id);
    setEmpresasPendientes((prev) => prev.filter((e) => e.id !== id));
  };
  // Aprobar/rechazar solicitudes de reclutador
  const handleAprobarReclutador = async (id) => {
    await adminService.aprobarSolicitudReclutador(id);
    setReclutadoresPendientes((prev) => prev.filter((r) => r.id !== id));
  };
  const handleRechazarReclutador = async (id) => {
    await adminService.rechazarSolicitudReclutador(id);
    setReclutadoresPendientes((prev) => prev.filter((r) => r.id !== id));
  };

  const handleModerarOferta = async (id, aprobada) => {
    await adminService.moderarOferta(id, aprobada);
    setOfertasPendientes((prev) => prev.filter((o) => o.id !== id));
  };

  /* Datos para el gráfico — aplanar estructura anidada del backend
   * El nuevo endpoint devuelve: { usuarios: {...}, pasantias: {...} }
   * El legacy devuelve todo en el root level */
  const s = stats ? {
    alumnosActivos:  stats.alumnosActivos  ?? stats.usuarios?.alumnosActivos  ?? stats.totalUsuarios   ?? 0,
    empresasActivas: stats.empresasActivas ?? stats.usuarios?.empresasAprobadas ?? stats.totalEmpresas  ?? 0,
    ofertasActivas:  stats.ofertasActivas  ?? stats.pasantias?.ofertasActivas  ?? stats.totalOfertas    ?? 0,
    postulaciones:   stats.postulaciones   ?? stats.pasantias?.totalPostulaciones ?? stats.totalPostulaciones ?? 0,
    contrataciones:  stats.contrataciones  ?? stats.pasantias?.contrataciones  ?? stats.contratados     ?? 0,
    tasaInsercion:   stats.tasaInsercion   ?? stats.pasantias?.tasaInsercion   ?? '0%',
  } : null;

  const chartData = s ? [
    { name: 'Alumnos',       valor: s.alumnosActivos },
    { name: 'Empresas',      valor: s.empresasActivas },
    { name: 'Ofertas',       valor: s.ofertasActivas },
    { name: 'Postulaciones', valor: s.postulaciones },
    { name: 'Contratados',   valor: s.contrataciones },
  ] : [];

  return (
    <div className="page-container">
      <div className="dashboard-header">
        <h1>Panel de Administración</h1>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <Link to="/admin/solicitudes" className="btn-secondary">📋 Solicitudes de Empresa</Link>
          <Link to="/admin/usuarios"   className="btn-secondary">👥 Usuarios</Link>
          <Link to="/admin/logs"       className="btn-secondary">🗒️ Historial de Accesos</Link>
        </div>
      </div>

      {error && <p className="error-msg" style={{ marginBottom: '1.5rem' }}>{error}</p>}

      {/* ── Tarjetas métricas ───────────────────────────────────────────── */}
      {loading ? (
        <div className={styles.statsGrid}>
          {METRIC_DEFS.map((m) => (
            <div key={m.key} className={styles.skeletonCard} />
          ))}
        </div>
      ) : s && (
        <div className={styles.statsGrid}>
          {METRIC_DEFS.map(({ key, label, icon, color, highlight }) => {
            const rawVal = s[key];
            return (
              <div
                key={key}
                className={`${styles.statCard} ${highlight ? styles.highlight : ''}`}
                style={{ '--sc': color }}
              >
                <span className={styles.statIcon}>{icon}</span>
                <span className={styles.statNum}>{rawVal ?? '—'}</span>
                <span className={styles.statLabel}>{label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Gráfico de barras ─────────────────────────────────────────────── */}
      {!loading && chartData.length > 0 && s && (
        <div className={styles.chartContainer}>
          <h2>Métricas del sistema</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} barSize={40}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontFamily: 'var(--font-primary)',
                }}
              />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Solicitudes de empresa pendientes ──────────────────────────────── */}
      <section className={styles.adminSection}>
        <h2>Solicitudes de Empresa Pendientes ({empresasPendientes.length})</h2>
        {empresasPendientes.length === 0 ? (
          <p className="msg">No hay solicitudes pendientes. ✅</p>
        ) : (
          <div className={styles.pendientesList}>
            {empresasPendientes.map((e) => (
              <div key={e.id} className={styles.pendienteCard}>
                <div>
                  <strong>{e.razonSocial}</strong>
                  <p>{e.email}{e.cuit ? ` — CUIT: ${e.cuit}` : ''}</p>
                </div>
                <div className={styles.pendienteActions}>
                  <button className="btn-ok"     onClick={() => handleAprobarEmpresa(e.id)}>✓ Aprobar</button>
                  <button className="btn-danger" onClick={() => handleRechazarEmpresa(e.id)}>✕ Rechazar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Solicitudes de reclutadores pendientes ───────────────────────────── */}
      <section className={styles.adminSection}>
        <h2>Solicitudes de Reclutadores Pendientes ({reclutadoresPendientes.length})</h2>
        {reclutadoresPendientes.length === 0 ? (
          <p className="msg">No hay solicitudes de reclutadores pendientes. ✅</p>
        ) : (
          <div className={styles.pendientesList}>
            {reclutadoresPendientes.map((r) => (
              <div key={r.id} className={styles.pendienteCard}>
                <div>
                  <strong>{r.nombre} {r.apellido}</strong>
                  <p>{r.email}{r.empresa ? ` — ${r.empresa.razonSocial}` : ''}</p>
                </div>
                <div className={styles.pendienteActions}>
                  <button className="btn-ok"     onClick={() => handleAprobarReclutador(r.id)}>✓ Aprobar</button>
                  <button className="btn-danger" onClick={() => handleRechazarReclutador(r.id)}>✕ Rechazar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Ofertas pendientes ─────────────────────────────────────────────── */}
      <section className={styles.adminSection}>
        <h2>Ofertas Pendientes de Moderación ({ofertasPendientes.length})</h2>
        {ofertasPendientes.length === 0 ? (
          <p className="msg">No hay ofertas pendientes. ✅</p>
        ) : (
          <div className={styles.pendientesList}>
            {ofertasPendientes.map((o) => (
              <div key={o.id} className={styles.pendienteCard}>
                <div>
                  <strong>{o.titulo}</strong>
                  <p>{o.empresa?.razonSocial}</p>
                </div>
                <div className={styles.pendienteActions}>
                  <button className="btn-ok"     onClick={() => handleModerarOferta(o.id, true)}>✓ Aprobar</button>
                  <button className="btn-danger" onClick={() => handleModerarOferta(o.id, false)}>✕ Rechazar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
