/**
 * EmpresaResumenPage.jsx — "Resumen de empresa" del ADMINISTRADOR DE EMPRESA.
 *
 * Responde "¿cómo está funcionando mi empresa dentro del sistema?": es una
 * vista de supervisión, no operativa. No crea ni edita ofertas ni mueve
 * candidatos (eso es del reclutador y de las páginas Ofertas / Candidatos).
 *
 * Datos: GET /api/empresas/dashboard (alcance: toda la empresa). Todo número
 * viene del backend o se deriva de esos valores; no hay tendencias ni
 * comparaciones con períodos anteriores porque el backend no las calcula.
 *
 * Bloques: Estado actual · Embudo de selección + tasa de contratación ·
 * Ofertas con más postulaciones · Ofertas recientes · Requieren atención.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { empresaService } from '../../services/empresa.service';
import { useEmpresa } from '../../hooks/useEmpresa';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Card from '../../components/ui/Card';
import Icon from '../../components/ui/Icon';
import EmbudoFunnel from '../../components/EmbudoFunnel/EmbudoFunnel';
import AttentionList from '../../components/AttentionList/AttentionList';
import { ESTADO_LABEL, ESTADO_TONO, MODERACION_LABEL, MODERACION_TONO } from '../../utils/ofertaEstados';
import styles from './EmpresaResumenPage.module.css';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('es-AR'));
const fmtPct = (n) => (n == null ? '—' : `${Number(n).toLocaleString('es-AR')}%`);
const fechaCorta = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR') : '—');

/** Porcentaje con 1 decimal; null (→ "—") si la base es 0: nunca NaN/Infinity. */
const pct = (parte, base) => (base > 0 ? Math.round((parte / base) * 1000) / 10 : null);

const nombreResponsable = (o) => (o.creadaPor ? `${o.creadaPor.nombre} ${o.creadaPor.apellido}` : 'Sin responsable asignado');

export default function EmpresaResumenPage() {
  const navigate = useNavigate();
  const { empresa } = useEmpresa();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    empresaService.getDashboard()
      .then((res) => { if (!cancelado) setData(res.data?.data ?? null); })
      .catch(() => { if (!cancelado) setError('No se pudo cargar el resumen de la empresa.'); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, []);

  const razonSocial = empresa?.razonSocial ?? data?.empresa?.razonSocial ?? 'tu empresa';
  const of = data?.ofertas;
  const post = data?.postulaciones;
  const equipo = data?.equipo;

  // ── Embudo: etapas = valores del backend; tasas = derivadas de esos valores ──
  // Las tasas usan cuántas postulaciones LLEGARON al menos a cada etapa (una
  // postulación en entrevista ya pasó por preselección), así nunca superan 100%.
  const etapas = post ? [
    { key: 'total', label: 'Postulaciones', valor: post.total },
    { key: 'revision', label: 'En revisión', valor: post.enRevision },
    { key: 'presel', label: 'Preseleccionados', valor: post.preseleccionados },
    { key: 'entrevista', label: 'Entrevistas', valor: post.entrevistas },
    { key: 'contratado', label: 'Contratados', valor: post.contrataciones },
  ] : [];

  const llegaronAPreseleccion = post ? post.preseleccionados + post.entrevistas + post.contrataciones : 0;
  const llegaronAEntrevista = post ? post.entrevistas + post.contrataciones : 0;
  const tasas = post ? [
    { key: 'pre', label: 'Preselección sobre postulaciones', valor: pct(llegaronAPreseleccion, post.total) },
    { key: 'ent', label: 'Entrevista sobre preseleccionados', valor: pct(llegaronAEntrevista, llegaronAPreseleccion) },
    { key: 'con', label: 'Contratación sobre entrevistas', valor: pct(post.contrataciones, llegaronAEntrevista) },
  ] : [];

  const tasaContratacion = post ? pct(post.contrataciones, post.total) : null;

  const atencion = data ? [
    {
      key: 'moderacion', title: 'Ofertas en revisión del instituto', icon: 'shield', tone: 'blue',
      count: of.pendienteModeracion,
      singular: 'oferta pendiente de moderación', plural: 'ofertas pendientes de moderación',
      to: '/empresa/ofertas?moderacion=pendiente', cta: 'Ver ofertas',
    },
    {
      key: 'solicitudes', title: 'Solicitudes de reclutador', icon: 'userPlus', tone: 'violet',
      count: equipo.solicitudesPendientes,
      singular: 'solicitud pendiente de aprobación', plural: 'solicitudes pendientes de aprobación',
      to: '/empresa/equipo?tab=solicitudes', cta: 'Ver equipo',
    },
    {
      key: 'pausadas', title: 'Ofertas pausadas', icon: 'pause', tone: 'orange',
      count: of.pausadas,
      singular: 'oferta pausada sin recibir postulaciones', plural: 'ofertas pausadas sin recibir postulaciones',
      to: '/empresa/ofertas?estado=pausada', cta: 'Revisar ofertas',
    },
  ] : [];

  return (
    <div className="page-container">
      <PageHeader
        title="Resumen de empresa"
        subtitle={`Estado general de ${razonSocial} y sus procesos de selección.`}
      />

      {error && <p className={`error-msg ${styles.error}`} role="alert">{error}</p>}

      {/* ── Estado actual ─────────────────────────────────────────────────── */}
      <section className={styles.seccion} aria-labelledby="sec-actual">
        <div className={styles.seccionHead}>
          <h2 id="sec-actual" className={styles.seccionTitulo}>Estado actual</h2>
          <p className={styles.seccionNota}>Valores a hoy de toda la empresa.</p>
        </div>
        <div className={styles.kpiGrid}>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <StatCard key={i} loading />)
          ) : data ? (
            <>
              <StatCard
                iconName="briefcase" tone="blue" label="Ofertas activas" value={fmt(of.activas)}
                hint={`de ${fmt(of.total)} publicadas`}
                onClick={() => navigate('/empresa/ofertas?estado=activa')} actionHint="Ver ofertas"
              />
              <StatCard
                iconName="send" tone="violet" label="Postulaciones" value={fmt(post.total)}
                onClick={() => navigate('/empresa/candidatos')} actionHint="Ver candidatos"
              />
              <StatCard
                iconName="calendar" tone="orange" label="Entrevistas" value={fmt(post.entrevistas)}
                onClick={() => navigate('/empresa/candidatos?estado=entrevista')} actionHint="Ver candidatos"
              />
              <StatCard
                iconName="checkCircle" tone="green" label="Contrataciones" value={fmt(post.contrataciones)}
                onClick={() => navigate('/empresa/candidatos?estado=contratado')} actionHint="Ver candidatos"
              />
              <StatCard
                iconName="userPlus" tone="teal" label="Reclutadores activos" value={fmt(equipo.reclutadoresActivos)}
                onClick={() => navigate('/empresa/equipo')} actionHint="Ver equipo"
              />
            </>
          ) : null}
        </div>
      </section>

      {!loading && data && (
        <>
          {/* ── Embudo + indicadores ──────────────────────────────────────── */}
          <div className={styles.dosColumnas}>
            <Card
              as="section" titleId="sec-embudo" title="Embudo de selección"
              subtitle="Postulaciones de la empresa según la etapa en la que están hoy."
              className={styles.bloque}
            >
              {post.total > 0 ? (
                <EmbudoFunnel etapas={etapas} tasas={tasas} />
              ) : (
                <p className={styles.vacio}>Todavía no hay postulaciones en las ofertas de la empresa.</p>
              )}
            </Card>

            <div className={styles.columna}>
              <StatCard
                iconName="percent" tone="green" label="Tasa de contratación"
                value={fmtPct(tasaContratacion)}
                hint="Contrataciones sobre el total de postulaciones de la empresa (histórico, sin filtro de fechas)."
                tooltip="Contrataciones ÷ postulaciones × 100. Sin postulaciones no hay base para calcularla."
              />

              <Card
                as="section" titleId="sec-top" title="Ofertas con más postulaciones"
                headingLevel={3} className={styles.bloque}
              >
                {data.topOfertasPostulaciones.length > 0 ? (
                  <ol className={styles.ranking}>
                    {data.topOfertasPostulaciones.map((o, i) => (
                      <li key={o.id} className={styles.rankingItem}>
                        <span className={styles.rankingPos}>{i + 1}</span>
                        <span className={styles.rankingTexto}>
                          <Link to={`/empresa/postulantes/${o.id}`} className={styles.rankingTitulo}>{o.titulo}</Link>
                          <small className={styles.sub}>{nombreResponsable(o)}</small>
                        </span>
                        <span className={styles.rankingValor}>
                          {fmt(o.totalPostulaciones)}{' '}
                          <span className={styles.rankingUnidad}>{o.totalPostulaciones === 1 ? 'postulación' : 'postulaciones'}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className={styles.vacio}>Ninguna oferta recibió postulaciones todavía.</p>
                )}
              </Card>
            </div>
          </div>

          {/* ── Ofertas recientes + Requieren atención ────────────────────── */}
          <div className={styles.dosColumnas}>
            <Card
              as="section" titleId="sec-recientes" title="Ofertas recientes"
              subtitle="Últimas publicaciones de la empresa."
              actions={<Link to="/empresa/ofertas" className={styles.verMas}>Ver todas las ofertas →</Link>}
              className={styles.bloque}
            >
              {data.ofertasRecientes.length > 0 ? (
                <ul className={styles.recientes}>
                  {data.ofertasRecientes.map((o) => (
                    <li key={o.id} className={styles.reciente}>
                      <div className={styles.recienteInfo}>
                        <span className={styles.recienteTitulo}>{o.titulo}</span>
                        <small className={styles.sub}>
                          {nombreResponsable(o)} · Publicada el {fechaCorta(o.createdAt)}
                        </small>
                        <div className={styles.recienteBadges}>
                          <span className={`badge badge-tone-${ESTADO_TONO[o.estado] ?? 'gray'}`}>
                            {ESTADO_LABEL[o.estado] ?? o.estado}
                          </span>
                          {o.estadoModeracion !== 'aprobada' && (
                            <span className={`badge badge-tone-${MODERACION_TONO[o.estadoModeracion] ?? 'gray'}`}>
                              {MODERACION_LABEL[o.estadoModeracion] ?? o.estadoModeracion}
                            </span>
                          )}
                          <span className={styles.recientePostulados}>
                            <Icon name="users" size={14} />
                            {fmt(o.totalPostulaciones)} {o.totalPostulaciones === 1 ? 'postulado' : 'postulados'}
                          </span>
                        </div>
                      </div>
                      <Link
                        to={`/empresa/postulantes/${o.id}`}
                        className="btn-small"
                        aria-label={`Ver candidatos de ${o.titulo}`}
                      >
                        Ver
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.vacio}>La empresa todavía no tiene ofertas publicadas.</p>
              )}
            </Card>

            <Card
              as="section" titleId="sec-atencion" title="Requieren atención"
              subtitle="Solo lo que necesita una decisión o seguimiento."
              className={styles.bloque}
            >
              <AttentionList items={atencion} hideZero emptyText="Todo al día: no hay nada que requiera tu atención." />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
