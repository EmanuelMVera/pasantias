/**
 * AdminDashboardPage.jsx — Panel resumen de la administración.
 *
 * Solo informa: no aprueba ni rechaza nada (eso se hace en Solicitudes /
 * Ofertas) y no repite la navegación (ya está en la sidebar). Cinco bloques con
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
 * /admin/actividad-reciente. No se muestran tendencias ni comparaciones con
 * períodos anteriores: el backend no las calcula.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminService } from '../../services/admin.service';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Card from '../../components/ui/Card';
import FilterGroup from '../../components/ui/FilterGroup';
import ExportMenu from '../../components/ui/ExportMenu';
import Toast from '../../components/ui/Toast';
import ActividadFeed from '../../components/ActividadFeed/ActividadFeed';
import AttentionList from '../../components/AttentionList/AttentionList';
import EmbudoFunnel from '../../components/EmbudoFunnel/EmbudoFunnel';
import { useToast } from '../../hooks/useToast';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { descargarBlob, nombreDesdeContentDisposition } from '../../utils/csv';
import styles from './AdminDashboardPage.module.css';

const PERIODOS = [
  { value: 7,   label: '7 días' },
  { value: 30,  label: '30 días' },
  { value: 90,  label: '90 días' },
  { value: 365, label: '1 año' },
];

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('es-AR'));
const fmtPct = (n) => (n == null ? '—' : `${Number(n).toLocaleString('es-AR')}%`);

const etiquetaPeriodo = (dias) => (PERIODOS.find((p) => p.value === dias)?.label ?? `${dias} días`);

// Estilos compartidos de recharts (grilla y ejes sutiles, tooltip como card).
const TICK = { fontSize: 12, fill: '#6b7c8f', fontFamily: 'var(--font-primary)' };
const TOOLTIP_STYLE = {
  background: '#fff',
  border: '1px solid #e3e9f0',
  borderRadius: 10,
  boxShadow: '0 10px 30px rgba(16, 42, 71, 0.12)',
  fontFamily: 'var(--font-primary)',
  fontSize: 13,
};

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const { toast, showToast } = useToast(5000);
  const angosto = useMediaQuery('(max-width: 560px)');

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

  // ExportMenu delega el manejo de errores en la página: antes un fallo acá
  // quedaba como promesa rechazada sin aviso.
  const handleExportEstadisticas = async (format) => {
    try {
      const res = await adminService.exportarEstadisticas({ format, periodoDias });
      const fallback = `estadisticas-${new Date().toISOString().slice(0, 10)}.${format}`;
      const nombre = nombreDesdeContentDisposition(res.headers['content-disposition'], fallback);
      descargarBlob(res.data, nombre);
      showToast(`Exportación ${format.toUpperCase()} generada.`, 'success');
    } catch {
      showToast('No se pudieron exportar las estadísticas.', 'error');
    }
  };

  const embudoEtapas = stats ? [
    { key: 'revision', label: 'En revisión', valor: stats.embudo.enRevision },
    { key: 'preseleccion', label: 'Preseleccionados', valor: stats.embudo.preseleccionado },
    { key: 'entrevista', label: 'Entrevista', valor: stats.embudo.entrevista },
    { key: 'contratado', label: 'Contratados', valor: stats.embudo.contratado },
  ] : [];

  const embudoTasas = stats ? [
    { key: 'pre', label: 'Preselección sobre revisión', valor: stats.embudo.tasaPreseleccionARevision },
    { key: 'ent', label: 'Entrevista sobre preselección', valor: stats.embudo.tasaEntrevistaAPreseleccion },
    { key: 'con', label: 'Contratado sobre entrevista', valor: stats.embudo.tasaContratadoAEntrevista },
  ] : [];

  const hayEmbudo = embudoEtapas.some((d) => d.valor > 0);
  const areaData = stats ? Object.entries(stats.ofertas.porArea).map(([name, valor]) => ({ name, valor })) : [];

  const cargando = statsLoading;
  const pendOfertas = stats?.ofertas.pendienteModeracion ?? null;

  const atencion = [
    {
      key: 'empresas', title: 'Solicitudes de empresa', icon: 'building', tone: 'orange', count: pendEmpresas,
      singular: 'empresa pendiente de aprobación', plural: 'empresas pendientes de aprobación',
      to: '/admin/solicitudes', cta: 'Revisar solicitudes',
    },
    {
      key: 'reclutadores', title: 'Solicitudes de reclutador', icon: 'userPlus', tone: 'violet', count: pendReclutadores,
      singular: 'reclutador pendiente de aprobación', plural: 'reclutadores pendientes de aprobación',
      to: '/admin/solicitudes?tab=reclutadores', cta: 'Revisar solicitudes',
    },
    {
      key: 'ofertas', title: 'Ofertas por moderar', icon: 'briefcase', tone: 'blue', count: pendOfertas,
      singular: 'oferta pendiente de moderación', plural: 'ofertas pendientes de moderación',
      to: '/admin/ofertas', cta: 'Revisar ofertas',
    },
  ];

  return (
    <div className="page-container">
      <PageHeader
        title="Panel de Administración"
        subtitle="Resumen general del estado del sistema y la actividad reciente."
        actions={<ExportMenu formats={['xlsx', 'pdf']} onExport={handleExportEstadisticas} label="Exportar estadísticas" />}
      />

      {statsError && <p className={`error-msg ${styles.error}`}>{statsError}</p>}

      {/* ── 1. Estado actual ─────────────────────────────────────────────── */}
      <section className={styles.seccion} aria-labelledby="sec-actual">
        <div className={styles.seccionHead}>
          <h2 id="sec-actual" className={styles.seccionTitulo}>Estado actual</h2>
          <p className={styles.seccionNota}>Valores a hoy, sin filtro de fechas.</p>
        </div>
        <div className={styles.kpiGrid}>
          {cargando ? (
            Array.from({ length: 7 }).map((_, i) => <StatCard key={i} loading />)
          ) : stats ? (
            <>
              <StatCard iconName="users" tone="blue" label="Alumnos activos" value={fmt(stats.usuarios.alumnos)} />
              <StatCard iconName="graduation" tone="green" label="Egresados activos" value={fmt(stats.usuarios.egresados)} />
              <StatCard iconName="building" tone="violet" label="Empresas aprobadas" value={fmt(stats.empresas.aprobadas)} />
              <StatCard
                iconName="inbox" tone="orange"
                label="Solicitudes de empresa pendientes" value={fmt(pendEmpresas)}
                tooltip="Solicitudes de registro de empresa que esperan aprobación. Click para revisarlas."
                onClick={() => navigate('/admin/solicitudes')} actionHint="Revisar"
              />
              <StatCard iconName="userPlus" tone="teal" label="Reclutadores activos" value={fmt(stats.empresas.reclutadoresActivos)} />
              <StatCard iconName="briefcase" tone="blue" label="Ofertas activas" value={fmt(stats.ofertas.activas)} />
              <StatCard
                iconName="shield" tone="orange"
                label="Ofertas pendientes de moderación" value={fmt(stats.ofertas.pendienteModeracion)}
                tooltip="Ofertas cargadas por una empresa que todavía no fueron aprobadas ni rechazadas. Click para revisarlas."
                onClick={() => navigate('/admin/ofertas')} actionHint="Moderar"
              />
            </>
          ) : null}
        </div>
      </section>

      {/* ── 2. Actividad del período (única sección afectada por el selector) ── */}
      <Card
        as="section"
        titleId="sec-periodo"
        title="Actividad del período"
        subtitle={`Postulaciones, contrataciones y altas de los últimos ${etiquetaPeriodo(periodoDias).toLowerCase()}.`}
        actions={(
          <FilterGroup
            label="Período"
            hideLabel
            ariaLabel="Período de la actividad"
            options={PERIODOS}
            value={periodoDias}
            onChange={setPeriodoDias}
          />
        )}
        className={`${styles.bloque} ${refrescando && !statsLoading ? styles.refrescando : ''}`}
        aria-busy={refrescando}
      >
        <div className={styles.periodoGrid}>
          {cargando ? (
            Array.from({ length: 3 }).map((_, i) => <StatCard key={i} loading />)
          ) : stats ? (
            <>
              <StatCard
                iconName="send" tone="blue" label="Postulaciones"
                value={fmt(stats.postulaciones.enPeriodo)} hint={`Últimos ${periodoDias} días`}
              />
              <StatCard
                iconName="checkCircle" tone="green" label="Contrataciones"
                value={fmt(stats.contrataciones.enPeriodo)} hint={`Últimos ${periodoDias} días`}
                tooltip="Postulaciones que pasaron a “contratado” durante el período, sin importar cuándo se postularon."
              />
              <StatCard
                iconName="userPlus" tone="violet" label="Altas de usuarios"
                value={fmt(stats.usuarios.altasEnPeriodo)} hint={`Últimos ${periodoDias} días`}
              />
            </>
          ) : null}
        </div>
      </Card>

      {/* ── 3. Indicadores históricos ─────────────────────────────────────── */}
      <section className={styles.seccion} aria-labelledby="sec-historico">
        <div className={styles.seccionHead}>
          <h2 id="sec-historico" className={styles.seccionTitulo}>
            Indicadores históricos <span className={styles.chipHistorico}>Histórico</span>
          </h2>
          <p className={styles.seccionNota}>Acumulados desde el inicio del sistema: no cambian con el período elegido.</p>
        </div>

        <div className={styles.historicoGrid}>
          <div className={styles.columna}>
            <div className={styles.kpiPar}>
              {cargando ? (
                Array.from({ length: 2 }).map((_, i) => <StatCard key={i} loading />)
              ) : stats ? (
                <>
                  <StatCard
                    iconName="percent" tone="green"
                    label="Tasa de contratación" value={fmtPct(stats.contrataciones.tasaContratacion)}
                    hint="Contrataciones sobre postulaciones"
                    tooltip="Contrataciones totales sobre postulaciones totales (histórico, no solo el período)."
                  />
                  <StatCard
                    iconName="clock" tone="blue"
                    label="Tiempo promedio de aprobación"
                    value={stats.empresas.tiempoPromedioAprobacionDias == null ? '—' : `${fmt(stats.empresas.tiempoPromedioAprobacionDias)} días`}
                    hint="Desde la solicitud hasta la aprobación"
                    tooltip="Promedio de días entre que una empresa envía su solicitud y el administrador la aprueba (histórico)."
                  />
                </>
              ) : null}
            </div>

            {!cargando && stats && (
              <Card as="section" titleId="sec-areas" title="Ofertas por área" subtitle="Cantidad de ofertas publicadas en cada área." headingLevel={3} className={styles.bloqueGrid}>
                {areaData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(180, areaData.length * 44)}>
                    <BarChart data={areaData} layout="vertical" margin={{ left: angosto ? 0 : 8, right: angosto ? 8 : 24, top: 4, bottom: 4 }} barSize={18}>
                      <CartesianGrid horizontal={false} stroke="#eef2f6" />
                      <XAxis type="number" allowDecimals={false} tick={TICK} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={angosto ? 96 : 150} tick={TICK} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: 'rgba(0, 115, 173, 0.06)' }}
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(v) => [fmt(v), 'Ofertas']}
                      />
                      <Bar dataKey="valor" fill="#0073AD" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className={styles.vacio}>Todavía no hay ofertas con área asignada.</p>
                )}
              </Card>
            )}
          </div>

          <div className={styles.columna}>
            {!cargando && stats && (
              <>
                <Card as="section" titleId="sec-embudo" title="Embudo de selección" subtitle="Postulaciones según la etapa en la que están." headingLevel={3} className={styles.bloqueGrid}>
                  {hayEmbudo ? (
                    <EmbudoFunnel etapas={embudoEtapas} tasas={embudoTasas} />
                  ) : (
                    <p className={styles.vacio}>Todavía no hay postulaciones en proceso de selección.</p>
                  )}
                </Card>

                <Card as="section" titleId="sec-ranking" title="Empresas con más ofertas publicadas" headingLevel={3} className={styles.bloqueGrid}>
                  {stats.empresas.conMasOfertas.length > 0 ? (
                    <ol className={styles.rankingList}>
                      {stats.empresas.conMasOfertas.map((e, i) => (
                        <li key={e.empresaId} className={styles.rankingItem}>
                          <span className={styles.rankingPos}>{i + 1}</span>
                          <span className={styles.rankingNombre}>{e.razonSocial}</span>
                          <span className={styles.rankingValor}>
                            {fmt(e.totalOfertas)} <span className={styles.rankingUnidad}>{e.totalOfertas === 1 ? 'oferta' : 'ofertas'}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className={styles.vacio}>Todavía no hay empresas con ofertas publicadas.</p>
                  )}
                </Card>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── 4 y 5. Requieren atención + actividad reciente ─────────────────── */}
      <div className={styles.dobleColumna}>
        <Card
          as="section"
          titleId="sec-atencion"
          title="Requieren atención"
          subtitle="Elementos que necesitan tu revisión o acción."
          className={styles.bloqueGrid}
        >
          <AttentionList items={atencion} />
          {pendientesError && <p className={`error-msg ${styles.errorInline}`}>{pendientesError}</p>}
        </Card>

        <Card
          as="section"
          titleId="sec-actividad"
          title="Actividad reciente"
          subtitle="Últimas acciones registradas en el sistema."
          actions={!actividadLoading && !actividadError && (
            <Link to="/admin/logs" className={styles.verMas}>Ver auditoría completa →</Link>
          )}
          className={styles.bloqueGrid}
        >
          {actividadLoading ? (
            <p className="msg">Cargando...</p>
          ) : actividadError ? (
            <p className="error-msg">{actividadError}</p>
          ) : (
            <ActividadFeed actividad={actividad} limite={5} />
          )}
        </Card>
      </div>

      <Toast toast={toast} />
    </div>
  );
}
