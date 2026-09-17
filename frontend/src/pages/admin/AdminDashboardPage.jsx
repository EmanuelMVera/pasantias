/**
 * AdminDashboardPage.jsx — Panel de Administración Institucional.
 *
 * Estadísticas profesionales (GET /api/admin/estadisticas, Fase 2): KPIs con
 * selector de período, embudo de selección, empresas con más ofertas,
 * ofertas por área, exportación a Excel/PDF. Debajo, las 3 colas de
 * aprobación (solicitudes de empresa, de reclutador, ofertas pendientes) y
 * el feed de actividad reciente — sin cambios de comportamiento ahí.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { adminService } from '../../services/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import ExportMenu from '../../components/ui/ExportMenu';
import { descargarBlob, nombreDesdeContentDisposition } from '../../utils/csv';
import styles from './AdminDashboardPage.module.css';

const PERIODOS = [
  { value: 7,   label: '7 días' },
  { value: 30,  label: '30 días' },
  { value: 90,  label: '90 días' },
  { value: 365, label: '1 año' },
];

const EMBUDO_COLORS = ['#0073AD', '#8e44ad', '#e67e22', '#27ae60'];
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('es-AR'));
const fmtPct = (n) => (n == null ? '—' : `${Number(n).toLocaleString('es-AR')}%`);

/** Feed de actividad reciente */
function ActividadFeed({ actividad }) {
  if (!actividad || actividad.length === 0) return (
    <p className="msg">No hay actividad reciente registrada.</p>
  );

  return (
    <div className={styles.actividadList}>
      {actividad.slice(0, 10).map((item) => (
        <div key={item.id ?? `${item.accion}-${item.createdAt}`} className={styles.actividadItem}>
          <span className={styles.actividadIcon}>📌</span>
          <div className={styles.actividadBody}>
            <span>
              {item.usuario ? `${item.usuario.nombre} ${item.usuario.apellido}` : 'Sistema'} — {item.accion?.replace(/_/g, ' ')}
              {item.entidad ? ` (${item.entidad}${item.entidadId ? ` #${item.entidadId}` : ''})` : ''}
            </span>
            <span className={styles.actividadFecha}>
              {item.createdAt ? new Date(item.createdAt).toLocaleString('es-AR') : ''}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [periodoDias, setPeriodoDias] = useState(30);
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState('');
  const [statsLoading, setStatsLoading] = useState(true);

  const [actividad, setActividad] = useState([]);
  const [empresasPendientes,   setEmpresasPendientes]   = useState([]);
  const [reclutadoresPendientes, setReclutadoresPendientes] = useState([]);
  const [ofertasPendientes,    setOfertasPendientes]    = useState([]);
  const [loading,              setLoading]              = useState(true);
  const [error,                setError]                = useState('');

  /* ── Estadísticas (dependen del período) ─────────────────────── */
  const cargarEstadisticas = useCallback(async (dias) => {
    setStatsLoading(true);
    setStatsError('');
    try {
      const res = await adminService.getEstadisticas({ periodoDias: dias });
      setStats(res.data.data ?? res.data);
    } catch {
      setStatsError('No se pudieron cargar las estadísticas.');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { cargarEstadisticas(periodoDias); }, [periodoDias, cargarEstadisticas]);

  /* ── Colas de aprobación + actividad (independientes del período) ─ */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [actRes, epRes, rrRes, opRes] = await Promise.allSettled([
          adminService.getActividadReciente(),
          adminService.getSolicitudesEmpresa({ estado: 'pendiente' }),
          adminService.getSolicitudesReclutador({ estado: 'pendiente' }),
          adminService.getOfertasPendientes(),
        ]);
        if (actRes.status === 'fulfilled') setActividad(actRes.value.data.data ?? actRes.value.data ?? []);
        if (epRes.status === 'fulfilled') setEmpresasPendientes(epRes.value.data.data ?? epRes.value.data ?? []);
        if (rrRes.status === 'fulfilled') setReclutadoresPendientes(rrRes.value.data.data ?? rrRes.value.data ?? []);
        if (opRes.status === 'fulfilled') setOfertasPendientes(opRes.value.data.data ?? opRes.value.data ?? []);
      } catch {
        setError('Error inesperado al cargar el panel.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleAprobarEmpresa = async (id) => {
    await adminService.aprobarSolicitud(id);
    setEmpresasPendientes((prev) => prev.filter((e) => e.id !== id));
  };
  const handleRechazarEmpresa = async (id) => {
    await adminService.rechazarSolicitud(id);
    setEmpresasPendientes((prev) => prev.filter((e) => e.id !== id));
  };
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

  const handleExportEstadisticas = async (format) => {
    const res = await adminService.exportarEstadisticas({ format, periodoDias });
    const fallback = `estadisticas-${new Date().toISOString().slice(0, 10)}.${format}`;
    const nombre = nombreDesdeContentDisposition(res.headers['content-disposition'], fallback);
    descargarBlob(res.data, nombre);
  };

  const embudoData = stats ? [
    { name: 'En revisión',    valor: stats.embudo.enRevision },
    { name: 'Preseleccionado', valor: stats.embudo.preseleccionado },
    { name: 'Entrevista',     valor: stats.embudo.entrevista },
    { name: 'Contratado',     valor: stats.embudo.contratado },
  ] : [];

  const areaData = stats ? Object.entries(stats.ofertas.porArea).map(([name, valor]) => ({ name, valor })) : [];

  return (
    <div className="page-container">
      <PageHeader
        title="Panel de Administración"
        actions={
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <Link to="/admin/solicitudes" className="btn-secondary">📋 Solicitudes</Link>
            <Link to="/admin/usuarios"   className="btn-secondary">👥 Usuarios</Link>
            <Link to="/admin/logs"       className="btn-secondary">🗒️ Auditoría</Link>
          </div>
        }
      />

      {error && <p className="error-msg" style={{ marginBottom: '1.5rem' }}>{error}</p>}

      {/* ── Estadísticas: selector de período + export ─────────────────── */}
      <div className={styles.statsToolbar}>
        <div className={styles.periodoSelector} role="group" aria-label="Período de las estadísticas">
          {PERIODOS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`filter-chip ${periodoDias === p.value ? 'is-active' : ''}`}
              onClick={() => setPeriodoDias(p.value)}
              aria-pressed={periodoDias === p.value}
            >
              {p.label}
            </button>
          ))}
        </div>
        <ExportMenu formats={['xlsx', 'pdf']} onExport={handleExportEstadisticas} label="Exportar estadísticas" />
      </div>

      {statsError && <p className="error-msg" style={{ marginBottom: '1rem' }}>{statsError}</p>}

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      {statsLoading ? (
        <div className={styles.statsGrid}>
          {Array.from({ length: 8 }).map((_, i) => <StatCard key={i} loading />)}
        </div>
      ) : stats ? (
        <div className={styles.statsGrid}>
          <StatCard icon="🎓" label="Alumnos activos" value={fmt(stats.usuarios.alumnos)} color="var(--primary)" />
          <StatCard icon="🏅" label="Egresados activos" value={fmt(stats.usuarios.egresados)} color="#1a5276" />
          <StatCard icon="🏢" label="Empresas aprobadas" value={fmt(stats.empresas.aprobadas)} color="#16a085" />
          <StatCard icon="⏳" label="Empresas pendientes" value={fmt(stats.empresas.pendientes)} color="var(--warning)" />
          <StatCard icon="🧑‍💼" label="Reclutadores activos" value={fmt(stats.empresas.reclutadoresActivos)} color="#8e44ad" />
          <StatCard icon="📢" label="Ofertas activas" value={fmt(stats.ofertas.activas)} color="var(--success)" />
          <StatCard icon="🔍" label="Ofertas pend. moderación" value={fmt(stats.ofertas.pendienteModeracion)} color="var(--warning)"
            tooltip="Ofertas cargadas por una empresa que todavía no fueron aprobadas ni rechazadas." />
          <StatCard icon="📋" label={`Postulaciones (${periodoDias}d)`} value={fmt(stats.postulaciones.enPeriodo)} color="#0073AD" />
          <StatCard icon="🤝" label={`Contrataciones (${periodoDias}d)`} value={fmt(stats.contrataciones.enPeriodo)} color="var(--success)" />
          <StatCard icon="📈" label="Tasa de contratación" value={fmtPct(stats.contrataciones.tasaContratacion)} color="var(--success)"
            tooltip="Contrataciones totales sobre postulaciones totales (histórico, no solo el período)." />
          <StatCard icon="🆕" label={`Altas de usuarios (${periodoDias}d)`} value={fmt(stats.usuarios.altasEnPeriodo)} color="var(--primary)" />
          {stats.empresas.tiempoPromedioAprobacionDias != null && (
            <StatCard icon="⏱️" label="Días promedio de aprobación" value={stats.empresas.tiempoPromedioAprobacionDias} color="#1a5276"
              tooltip="Promedio de días entre el alta de una empresa y su aprobación." />
          )}
        </div>
      ) : null}

      {/* ── Embudo de selección ─────────────────────────────────────────── */}
      {!statsLoading && stats && embudoData.some((d) => d.valor > 0) && (
        <div className={styles.chartContainer}>
          <h2>Embudo de selección</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={embudoData} barSize={48}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
              <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', fontFamily: 'var(--font-primary)' }} />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                {embudoData.map((_, i) => <Cell key={i} fill={EMBUDO_COLORS[i % EMBUDO_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className={styles.embudoNota}>
            Preselección sobre revisión: {fmtPct(stats.embudo.tasaPreseleccionARevision)} · Entrevista sobre preselección: {fmtPct(stats.embudo.tasaEntrevistaAPreseleccion)} · Contratado sobre entrevista: {fmtPct(stats.embudo.tasaContratadoAEntrevista)}
          </p>
        </div>
      )}

      {/* ── Ofertas por área + empresas con más ofertas ──────────────────── */}
      {!statsLoading && stats && (
        <div className={styles.dobleColumna}>
          {areaData.length > 0 && (
            <div className={styles.chartContainer}>
              <h2>Ofertas por área</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={areaData} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }} />
                  <Bar dataKey="valor" fill="var(--primary)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {stats.empresas.conMasOfertas.length > 0 && (
            <div className={styles.chartContainer}>
              <h2>Empresas con más ofertas publicadas</h2>
              <ul className={styles.rankingList}>
                {stats.empresas.conMasOfertas.map((e, i) => (
                  <li key={e.empresaId} className={styles.rankingItem}>
                    <span className={styles.rankingPos}>{i + 1}</span>
                    <span className={styles.rankingNombre}>{e.razonSocial}</span>
                    <span className={styles.rankingValor}>{fmt(e.totalOfertas)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Actividad reciente ───────────────────────────────────────────── */}
      <section className={styles.adminSection}>
        <h2>Actividad reciente</h2>
        {loading ? <p className="msg">Cargando...</p> : <ActividadFeed actividad={actividad} />}
      </section>

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
