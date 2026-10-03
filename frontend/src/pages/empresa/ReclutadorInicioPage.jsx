/**
 * ReclutadorInicioPage.jsx — Inicio del RECLUTADOR ("Mi espacio de reclutamiento").
 *
 * Ruta: /empresa (cuando el rol interno es reclutador).
 * Consume: GET /api/empresas/dashboard → para un reclutador el backend devuelve
 * su panel PERSONAL (`alcance: 'reclutador'`): solo las ofertas a su cargo.
 *
 * Responde "¿qué tengo que gestionar hoy?":
 *   - 4 KPIs propios (ofertas activas, en revisión, entrevistas, contratados);
 *   - Para atender: pendientes reales, cada uno con su acción directa;
 *   - Mis procesos activos: hasta 5 ofertas con su distribución de candidatos.
 *
 * No hay embudo ni métricas de la empresa: eso es del administrador de empresa.
 * No se inventa nada: si no hay pendientes dice "Todo al día por ahora".
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { empresaService } from '../../services/empresa.service';
import { useEmpresa } from '../../hooks/useEmpresa';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Icon from '../../components/ui/Icon';
import { ESTADO_LABEL, ESTADO_TONO, MODERACION_LABEL, MODERACION_TONO } from '../../utils/ofertaEstados';
import styles from './ReclutadorInicioPage.module.css';

const plural = (n, uno, muchos) => `${n} ${n === 1 ? uno : muchos}`;

/** Texto, ícono y acción de cada pendiente (los tipos los define el backend). */
function describir(item) {
  const proceso = `/empresa/postulantes/${item.ofertaId}`;
  switch (item.tipo) {
    case 'candidatos_en_revision':
      return {
        icon: 'inbox', tone: 'orange',
        texto: item.cantidad === 1 ? '1 candidato espera revisión' : `${item.cantidad} candidatos esperan revisión`,
        to: `${proceso}?estado=en_revision`, cta: 'Revisar candidatos',
      };
    case 'candidatos_en_entrevista':
      return {
        icon: 'calendar', tone: 'violet',
        texto: item.cantidad === 1 ? '1 candidato en entrevista' : `${item.cantidad} candidatos en entrevista`,
        to: `${proceso}?estado=entrevista`, cta: 'Ver entrevistas',
      };
    case 'oferta_rechazada':
      return {
        icon: 'xCircle', tone: 'red',
        texto: 'Oferta rechazada en la moderación: corregila para volver a enviarla a revisión',
        to: `/empresa/ofertas/${item.ofertaId}/editar`, cta: 'Editar oferta',
      };
    case 'cierre_proximo':
      return {
        icon: 'clock', tone: 'orange',
        texto: item.dias === 0 ? 'La oferta cierra hoy' : `La oferta cierra en ${plural(item.dias, 'día', 'días')}`,
        to: proceso, cta: 'Gestionar proceso',
      };
    case 'oferta_pendiente_moderacion':
      return {
        icon: 'shield', tone: 'blue',
        texto: 'Esperando revisión institucional',
        to: '/empresa/ofertas?moderacion=pendiente', cta: 'Ver oferta',
      };
    default:
      return null;
  }
}

const ETAPAS = [
  { key: 'enRevision', label: 'En revisión' },
  { key: 'preseleccionados', label: 'Preseleccionados' },
  { key: 'entrevistas', label: 'Entrevistas' },
  { key: 'contratados', label: 'Contratados' },
];

export default function ReclutadorInicioPage() {
  const navigate = useNavigate();
  const { empresa } = useEmpresa();
  const [panel, setPanel] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    empresaService.getDashboard()
      .then((res) => { if (vigente) setPanel(res.data?.data ?? {}); })
      .catch((err) => { if (vigente) setError(err.response?.data?.message ?? 'No se pudo cargar tu espacio de reclutamiento.'); });
    return () => { vigente = false; };
  }, []);

  const cargando = !panel && !error;
  const ofertas = panel?.ofertas ?? {};
  const post = panel?.postulaciones ?? {};
  const pendientes = (panel?.paraAtender ?? []).map((it) => ({ ...it, ...describir(it) })).filter((it) => it.cta);
  const procesos = panel?.procesosActivos ?? [];
  const razonSocial = empresa?.razonSocial;

  return (
    <div className="page-container">
      <PageHeader
        title="Mi espacio de reclutamiento"
        subtitle={razonSocial
          ? `Gestioná tus ofertas y candidatos de ${razonSocial}.`
          : 'Gestioná tus ofertas y candidatos.'}
        actions={(
          <Link to="/empresa/nueva-oferta" className="btn-primary">
            <Icon name="plus" size={18} strokeWidth={2.2} />
            Nueva oferta
          </Link>
        )}
      />

      {error && <p className={`error-msg ${styles.error}`} role="alert">{error}</p>}

      {/* ── KPIs personales ────────────────────────────────────────────────── */}
      <section className={styles.kpis} aria-label="Mis números">
        <StatCard
          loading={cargando} iconName="briefcase" tone="blue" label="Ofertas activas" value={ofertas.activas}
          onClick={() => navigate('/empresa/ofertas?estado=activa')} actionHint="Ver mis ofertas"
        />
        <StatCard
          loading={cargando} iconName="inbox" tone="orange" label="En revisión" value={post.enRevision}
          onClick={() => navigate('/empresa/candidatos?estado=en_revision')} actionHint="Revisar"
        />
        <StatCard
          loading={cargando} iconName="calendar" tone="violet" label="Entrevistas" value={post.entrevistas}
          onClick={() => navigate('/empresa/candidatos?estado=entrevista')} actionHint="Ver entrevistas"
        />
        <StatCard
          loading={cargando} iconName="checkCircle" tone="green" label="Contratados" value={post.contrataciones}
          onClick={() => navigate('/empresa/candidatos?estado=contratado')} actionHint="Ver contratados"
        />
      </section>

      {!cargando && !error && (
        <div className={styles.columnas}>
          {/* ── Para atender ───────────────────────────────────────────────── */}
          <Card as="section" titleId="sec-atender" title="Para atender" className={styles.bloque}>
            {pendientes.length === 0 ? (
              <p className={styles.alDia}>
                <span className={styles.alDiaIcono}><Icon name="checkCircle" size={22} /></span>
                Todo al día por ahora.
              </p>
            ) : (
              <ul className={styles.pendientes}>
                {pendientes.map((it) => (
                  <li key={`${it.tipo}-${it.ofertaId}`} className={styles.pendiente}>
                    <span className={`${styles.pendienteIcono} ${styles[`tono_${it.tone}`]}`}>
                      <Icon name={it.icon} size={20} />
                    </span>
                    <div className={styles.pendienteInfo}>
                      <span className={styles.pendienteTexto}>{it.texto}</span>
                      <span className={styles.pendienteContexto}>{it.titulo}</span>
                    </div>
                    <Link to={it.to} className={`btn-secondary ${styles.pendienteCta}`} aria-label={`${it.cta}: ${it.titulo}`}>
                      {it.cta}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ── Mis procesos activos ───────────────────────────────────────── */}
          <Card as="section" titleId="sec-procesos" title="Mis procesos activos" className={styles.bloque}>
            {procesos.length === 0 ? (
              <EmptyState iconName="briefcase" title="Todavía no tenés procesos activos." hint="Publicá una oferta para empezar a recibir postulaciones.">
                <Link to="/empresa/nueva-oferta" className="btn-primary">Nueva oferta</Link>
              </EmptyState>
            ) : (
              <>
                <ul className={styles.procesos}>
                  {procesos.map(({ oferta, totalCandidatos, porEstado }) => (
                    <li key={oferta.id} className={styles.proceso}>
                      <div className={styles.procesoCabecera}>
                        <span className={styles.procesoTitulo}>{oferta.titulo}</span>
                        <span className={styles.procesoBadges}>
                          <span className={`badge badge-tone-${ESTADO_TONO[oferta.estado] ?? 'gray'}`}>{ESTADO_LABEL[oferta.estado] ?? oferta.estado}</span>
                          {/* La moderación solo se muestra cuando no es el estado normal. */}
                          {oferta.estadoModeracion !== 'aprobada' && (
                            <span className={`badge badge-tone-${MODERACION_TONO[oferta.estadoModeracion] ?? 'gray'}`}>
                              {MODERACION_LABEL[oferta.estadoModeracion] ?? oferta.estadoModeracion}
                            </span>
                          )}
                        </span>
                      </div>
                      <dl className={styles.etapas} aria-label={`Candidatos de ${oferta.titulo}`}>
                        <div className={styles.etapaTotal}>
                          <dt>Candidatos</dt>
                          <dd>{totalCandidatos}</dd>
                        </div>
                        {ETAPAS.map((e) => (
                          <div key={e.key}>
                            <dt>{e.label}</dt>
                            <dd>{porEstado[e.key]}</dd>
                          </div>
                        ))}
                      </dl>
                      <Link
                        to={`/empresa/postulantes/${oferta.id}`}
                        className={`btn-small ${styles.procesoCta}`}
                        aria-label={`Gestionar proceso de ${oferta.titulo}`}
                      >
                        Gestionar proceso
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link to="/empresa/ofertas" className={styles.verTodas}>
                  Ver todas mis ofertas <Icon name="arrowRight" size={16} />
                </Link>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
