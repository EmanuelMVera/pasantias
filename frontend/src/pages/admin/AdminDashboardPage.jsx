/**
 * AdminDashboardPage.jsx — Panel resumen de la administración.
 *
 * Solo informa: no aprueba ni rechaza nada (eso se hace en Solicitudes /
 * Ofertas) y no repite la navegación (ya está en el navbar). Cinco bloques con
 * un significado temporal distinto, para no mezclar métricas:
 *
 *   1. Estado actual            → "a hoy"
 *   2. Actividad del período    → única sección que depende del selector 7/30/90/365
 *   3. Indicadores históricos   → acumulado, no depende del período
 *   4. Requieren atención       → conteos de pendientes + enlace a su página
 *   5. Actividad reciente       → últimos 5 eventos + enlace a la auditoría
 *
 * Datos (sin endpoints nuevos): /admin/estadisticas, los `conteoPorEstado` de
 * solicitudes de empresa/reclutador (limit=1: solo interesa el conteo) y
 * /admin/actividad-reciente.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminService } from '../../services/admin.service';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import ExportMenu from '../../components/ui/ExportMenu';
import ActividadFeed from '../../components/ActividadFeed/ActividadFeed';
import AttentionList from '../../components/AttentionList/AttentionList';
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

const etiquetaPeriodo = (dias) => (PERIODOS.find((p) => p.value === dias)?.label ?? `${dias} días`);

export default function AdminDashboardPage() {
  const navigate = useNavigate();

  const [periodoDias, setPeriodoDias] = useState(30);
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState('');
  const [statsLoading, setStatsLoading] = useState(true);   // solo la primera carga
  const [refrescando, setRefrescando] = useState(false);    // cambios de período

  // Conteos de pendientes (null = aún no se pudo obtener)
  const [pendEmpresas, setPendEmpresas] = useState(null);
  const [pendReclutadores, setPendReclutadores] = useState(null);
  const [pendientesError, setPendientesError] = useState('');

  const [actividad, setActividad] = useState([]);
  const [actividadLoading, setActividadLoading] = useState(true);
  const [actividadError, setActividadError] = useState('');

  /* ── Estadísticas ────────────────────────────────────────────────────────
     Al cambiar el período se conservan los valores previos (sin volver al
     skeleton) para que el layout no salte: solo se atenúa la sección del período. */
  const cargarEstadisticas = useCallback(async (dias) => {
    setRefrescando(true);
    setStatsError('');
    try {
      const res = await adminService.getEstadisticas({ periodoDias: dias });
      setStats(res.data.data ?? res.data);
    } catch {
      setStatsError('No se pudieron cargar las estadísticas.');
    } finally {
      setStatsLoading(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { cargarEstadisticas(periodoDias); }, [periodoDias, cargarEstadisticas]);

  /* ── Pendientes + actividad reciente (independientes del período) ─────── */
  useEffect(() => {
    (async () => {
      const [emp, rec, act] = await Promise.allSettled([
        adminService.getSolicitudesEmpresa({ limit: 1 }),
        adminService.getSolicitudesReclutador({ limit: 1 }),
        adminService.getActividadReciente(),
      ]);

      if (emp.status === 'fulfilled') setPendEmpresas(emp.value.data.conteoPorEstado?.pendiente ?? 0);
      if (rec.status === 'fulfilled') setPendReclutadores(rec.value.data.conteoPorEstado?.pendiente ?? 0);
      if (emp.status === 'rejected' || rec.status === 'rejected') {
        setPendientesError('No se pudieron obtener todos los pendientes.');
      }

      if (act.status === 'fulfilled') {
        setActividad(act.value.data.data ?? act.value.data ?? []);
      } else {
        setActividadError('No se pudo cargar la actividad reciente.');
      }
      setActividadLoading(false);
    })();
  }, []);

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

  const cargando = statsLoading;
  const pendOfertas = stats?.ofertas.pendienteModeracion ?? null;

  const atencion = [
    {
      key: 'empresas', count: pendEmpresas,
      singular: 'empresa pendiente de aprobación', plural: 'empresas pendientes de aprobación',
      to: '/admin/solicitudes', cta: 'Revisar solicitudes',
    },
    {
      key: 'reclutadores', count: pendReclutadores,
      singular: 'reclutador pendiente de aprobación', plural: 'reclutadores pendientes de aprobación',
      to: '/admin/solicitudes?tab=reclutadores', cta: 'Revisar solicitudes',
    },
    {
      key: 'ofertas', count: pendOfertas,
      singular: 'oferta pendiente de moderación', plural: 'ofertas pendientes de moderación',
      to: '/admin/ofertas', cta: 'Revisar ofertas',
    },
  ];

  return (
    <div className="page-container">
      <PageHeader
        title="Panel de Administración"
        subtitle="Resumen del sistema: estado actual, actividad reciente e indicadores históricos."
        actions={<ExportMenu formats={['xlsx', 'pdf']} onExport={handleExportEstadisticas} label="Exportar estadísticas" />}
      />

      {statsError && <p className="error-msg" style={{ marginBottom: '1.25rem' }}>{statsError}</p>}

      {/* ── 1. Estado actual ─────────────────────────────────────────────── */}
      <section className={styles.seccion} aria-labelledby="sec-actual">
        <div className={styles.seccionHead}>
          <h2 id="sec-actual" className={styles.seccionTitulo}>Estado actual</h2>
          <p className={styles.seccionNota}>Valores a hoy, sin filtro de fechas.</p>
        </div>
        <div className={styles.statsGrid}>
          {cargando ? (
            Array.from({ length: 7 }).map((_, i) => <StatCard key={i} loading />)
          ) : stats ? (
            <>
              <StatCard label="Alumnos activos" value={fmt(stats.usuarios.alumnos)} color="var(--primary)" />
              <StatCard label="Egresados activos" value={fmt(stats.usuarios.egresados)} color="#1a5276" />
              <StatCard label="Empresas aprobadas" value={fmt(stats.empresas.aprobadas)} color="#16a085" />
              <StatCard
                label="Solicitudes de empresa pendientes" value={fmt(pendEmpresas)} color="var(--warning)"
                tooltip="Solicitudes de registro de empresa que esperan aprobación. Click para revisarlas."
                onClick={() => navigate('/admin/solicitudes')}
              />
              <StatCard label="Reclutadores activos" value={fmt(stats.empresas.reclutadoresActivos)} color="#8e44ad" />
              <StatCard label="Ofertas activas" value={fmt(stats.ofertas.activas)} color="var(--success)" />
              <StatCard
                label="Ofertas pendientes de moderación" value={fmt(stats.ofertas.pendienteModeracion)} color="var(--warning)"
                tooltip="Ofertas cargadas por una empresa que todavía no fueron aprobadas ni rechazadas. Click para revisarlas."
                onClick={() => navigate('/admin/ofertas')}
              />
            </>
          ) : null}
        </div>
      </section>

      {/* ── 2. Actividad del período (única sección afectada por el selector) ── */}
      <section
        className={`${styles.seccion} ${refrescando && !statsLoading ? styles.refrescando : ''}`}
        aria-labelledby="sec-periodo"
        aria-busy={refrescando}
      >
        <div className={styles.seccionHead}>
          <div>
            <h2 id="sec-periodo" className={styles.seccionTitulo}>Actividad del período</h2>
            <p className={styles.seccionNota}>
              Postulaciones, contrataciones y altas de los últimos {etiquetaPeriodo(periodoDias).toLowerCase()}.
            </p>
          </div>
          <div className={styles.periodoSelector} role="group" aria-label="Período de la actividad">
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
        </div>
        <div className={styles.statsGrid}>
          {cargando ? (
            Array.from({ length: 3 }).map((_, i) => <StatCard key={i} loading />)
          ) : stats ? (
            <>
              <StatCard label={`Postulaciones (${periodoDias}d)`} value={fmt(stats.postulaciones.enPeriodo)} color="#0073AD" />
              <StatCard
                label={`Contrataciones (${periodoDias}d)`} value={fmt(stats.contrataciones.enPeriodo)} color="var(--success)"
                tooltip="Postulaciones que pasaron a “contratado” durante el período, sin importar cuándo se postularon."
              />
              <StatCard label={`Altas de usuarios (${periodoDias}d)`} value={fmt(stats.usuarios.altasEnPeriodo)} color="var(--primary)" />
            </>
          ) : null}
        </div>
      </section>

      {/* ── 3. Indicadores históricos ─────────────────────────────────────── */}
      <section className={styles.seccion} aria-labelledby="sec-historico">
        <div className={styles.seccionHead}>
          <div>
            <h2 id="sec-historico" className={styles.seccionTitulo}>
              Indicadores históricos <span className={styles.chipHistorico}>Histórico</span>
            </h2>
            <p className={styles.seccionNota}>Acumulados desde el inicio del sistema: no cambian con el período elegido.</p>
          </div>
        </div>

        <div className={styles.statsGrid}>
          {cargando ? (
            Array.from({ length: 2 }).map((_, i) => <StatCard key={i} loading />)
          ) : stats ? (
            <>
              <StatCard
                label="Tasa de contratación (histórica)" value={fmtPct(stats.contrataciones.tasaContratacion)} color="var(--success)"
                tooltip="Contrataciones totales sobre postulaciones totales (histórico, no solo el período)."
              />
              <StatCard
                label="Tiempo promedio de aprobación"
                value={stats.empresas.tiempoPromedioAprobacionDias == null ? '—' : `${fmt(stats.empresas.tiempoPromedioAprobacionDias)} días`}
                color="#1a5276"
                tooltip="Promedio de días entre que una empresa envía su solicitud y el administrador la aprueba (histórico)."
              />
            </>
          ) : null}
        </div>

        {!cargando && stats && embudoData.some((d) => d.valor > 0) && (
          <div className={styles.chartContainer}>
            <h3>Embudo de selección</h3>
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

        {!cargando && stats && (
          <div className={styles.dobleColumna}>
            {areaData.length > 0 && (
              <div className={styles.chartContainer}>
                <h3>Ofertas por área</h3>
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
                <h3>Empresas con más ofertas publicadas</h3>
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
      </section>

      {/* ── 4 y 5. Requieren atención + actividad reciente ─────────────────── */}
      <div className={styles.dobleColumna}>
        <section className={styles.panel} aria-labelledby="sec-atencion">
          <h2 id="sec-atencion" className={styles.panelTitulo}>Requieren atención</h2>
          <AttentionList items={atencion} />
          {pendientesError && <p className="error-msg" style={{ marginTop: '0.75rem' }}>{pendientesError}</p>}
        </section>

        <section className={styles.panel} aria-labelledby="sec-actividad">
          <h2 id="sec-actividad" className={styles.panelTitulo}>Actividad reciente</h2>
          {actividadLoading ? (
            <p className="msg">Cargando...</p>
          ) : actividadError ? (
            <p className="error-msg">{actividadError}</p>
          ) : (
            <>
              <ActividadFeed actividad={actividad} limite={5} />
              <Link to="/admin/logs" className={styles.verMas}>Ver auditoría completa →</Link>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
