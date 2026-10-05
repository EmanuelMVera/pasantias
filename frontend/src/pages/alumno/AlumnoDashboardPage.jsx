/**
 * AlumnoDashboardPage.jsx — Inicio del alumno/egresado.
 *
 * Ruta: /dashboard (roles alumno, egresado)
 * Consume: GET /api/students/dashboard → métricas de sus postulaciones,
 * notificaciones sin leer, % de perfil, `cvCargado` y hasta 5 ofertas
 * recomendadas (ya excluye las ofertas a las que se postuló).
 *
 * Responde "¿qué hago ahora?":
 *   - 4 KPIs desde el punto de vista del candidato (cada uno filtra Mis
 *     postulaciones): Postulaciones · En proceso (en revisión + preseleccionado,
 *     agrupación de presentación: ?grupo=en_proceso) · Entrevistas · Contratado;
 *   - Próximos pasos: pendientes reales con su acción (CV faltante, entrevistas,
 *     preselecciones, notificaciones, perfil incompleto). Si no hay nada:
 *     "Todo al día por ahora";
 *   - Mi perfil: % completado;
 *   - Ofertas para vos: las recomendadas.
 *
 * Sin accesos rápidos: duplicaban la barra de navegación.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { studentService } from '../../services/student.service';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Icon from '../../components/ui/Icon';
import { modalidadLabel } from '../../utils/ofertaPresentacion';
import styles from './AlumnoDashboardPage.module.css';

const plural = (n, uno, muchos) => `${n} ${n === 1 ? uno : muchos}`;

/** Pendientes del alumno, en orden de importancia. Solo datos reales. */
function proximosPasos(d) {
  const pasos = [];
  if (d.cvCargado === false) {
    pasos.push({
      key: 'cv', icon: 'file', tone: 'red',
      texto: 'Subí tu CV', contexto: 'Lo necesitás para poder postularte a una oferta.',
      to: '/perfil#cv', cta: 'Subir CV',
    });
  }
  if (d.entrevistas > 0) {
    pasos.push({
      key: 'entrevista', icon: 'calendar', tone: 'violet',
      texto: d.entrevistas === 1 ? 'Tenés 1 postulación en entrevista' : `Tenés ${d.entrevistas} postulaciones en entrevista`,
      contexto: 'Revisá el chat con el reclutador para coordinar.',
      to: '/mis-postulaciones?estado=entrevista', cta: 'Ver entrevistas',
    });
  }
  if (d.preseleccionados > 0) {
    pasos.push({
      key: 'preseleccion', icon: 'check', tone: 'blue',
      texto: d.preseleccionados === 1 ? 'Quedaste preseleccionado en 1 oferta' : `Quedaste preseleccionado en ${d.preseleccionados} ofertas`,
      contexto: 'El reclutador ya puede escribirte por chat.',
      to: '/mis-postulaciones?estado=preseleccionado', cta: 'Ver postulaciones',
    });
  }
  if (d.notificacionesNoLeidas > 0) {
    pasos.push({
      key: 'notif', icon: 'bell', tone: 'orange',
      texto: plural(d.notificacionesNoLeidas, 'notificación sin leer', 'notificaciones sin leer'),
      contexto: 'Novedades de tus postulaciones y de la plataforma.',
      to: '/notificaciones', cta: 'Ver notificaciones',
    });
  }
  if (d.perfilCompleto < 80) {
    pasos.push({
      key: 'perfil', icon: 'user', tone: 'orange',
      texto: `Tu perfil está al ${d.perfilCompleto}%`,
      contexto: 'Un perfil completo mejora tus recomendaciones y lo que ven las empresas.',
      to: '/perfil', cta: 'Completar perfil',
    });
  }
  return pasos;
}

function tonoProgreso(pct) {
  if (pct < 40) return styles.barraBaja;
  if (pct < 75) return styles.barraMedia;
  return styles.barraAlta;
}

export default function AlumnoDashboardPage() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [panel, setPanel] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    studentService.getDashboard()
      .then(({ data }) => { if (vigente) setPanel(data.data ?? {}); })
      .catch((err) => { if (vigente) setError(err.response?.data?.message ?? 'No se pudo cargar tu inicio.'); });
    return () => { vigente = false; };
  }, []);

  const cargando = !panel && !error;
  const d = {
    total: panel?.totalPostulaciones ?? 0,
    enProceso: panel?.enProceso ?? ((panel?.enRevision ?? 0) + (panel?.preseleccionados ?? 0)),
    preseleccionados: panel?.preseleccionados ?? 0,
    entrevistas: panel?.entrevistas ?? 0,
    contrataciones: panel?.contrataciones ?? 0,
    notificacionesNoLeidas: panel?.notificacionesNoLeidas ?? 0,
    perfilCompleto: panel?.perfilCompleto ?? 0,
    cvCargado: panel?.cvCargado,
  };
  const pasos = panel ? proximosPasos(d) : [];
  const recomendadas = panel?.ofertasRecomendadas ?? [];
  const rolLabel = usuario?.rol === 'egresado' ? 'Egresado' : 'Alumno';

  return (
    <div className="page-container">
      <PageHeader
        title={`Hola, ${usuario?.nombre ?? ''}`}
        subtitle={`${rolLabel} · Seguí tus postulaciones y encontrá nuevas oportunidades.`}
      />

      {error && <p className={`error-msg ${styles.error}`} role="alert">{error}</p>}

      {/* ── KPIs de mis postulaciones ─────────────────────────────────────── */}
      <section className={styles.kpis} aria-label="Mis postulaciones">
        <StatCard
          loading={cargando} iconName="briefcase" tone="blue" label="Postulaciones" value={d.total}
          onClick={() => navigate('/mis-postulaciones')} actionHint="Ver todas"
        />
        <StatCard
          loading={cargando} iconName="inbox" tone="orange" label="En proceso" value={d.enProceso}
          onClick={() => navigate('/mis-postulaciones?grupo=en_proceso')} actionHint="Ver"
        />
        <StatCard
          loading={cargando} iconName="calendar" tone="violet" label="Entrevistas" value={d.entrevistas}
          onClick={() => navigate('/mis-postulaciones?estado=entrevista')} actionHint="Ver"
        />
        <StatCard
          loading={cargando} iconName="checkCircle" tone="green" label="Contratado" value={d.contrataciones}
          onClick={() => navigate('/mis-postulaciones?estado=contratado')} actionHint="Ver"
        />
      </section>

      {panel && (
        <div className={styles.columnas}>
          <div className={styles.columna}>
            {/* ── Próximos pasos ─────────────────────────────────────────── */}
            <Card as="section" titleId="sec-pasos" title="Próximos pasos">
              {pasos.length === 0 ? (
                <p className={styles.alDia}>
                  <span className={styles.alDiaIcono}><Icon name="checkCircle" size={22} /></span>
                  Todo al día por ahora.
                </p>
              ) : (
                <ul className={styles.pasos}>
                  {pasos.map((p) => (
                    <li key={p.key} className={styles.paso}>
                      <span className={`${styles.pasoIcono} ${styles[`tono_${p.tone}`]}`}>
                        <Icon name={p.icon} size={20} />
                      </span>
                      <div className={styles.pasoInfo}>
                        <span className={styles.pasoTexto}>{p.texto}</span>
                        <span className={styles.pasoContexto}>{p.contexto}</span>
                      </div>
                      <Link to={p.to} className={`btn-secondary ${styles.pasoCta}`}>{p.cta}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* ── Mi perfil ──────────────────────────────────────────────── */}
            <Card as="section" titleId="sec-perfil" title="Mi perfil">
              <div className={styles.progresoCabecera}>
                <span>Perfil completado</span>
                <strong>{d.perfilCompleto}%</strong>
              </div>
              <div
                className={styles.barra}
                role="progressbar"
                aria-valuenow={d.perfilCompleto}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Perfil completado"
              >
                <div className={`${styles.barraRelleno} ${tonoProgreso(d.perfilCompleto)}`} style={{ width: `${d.perfilCompleto}%` }} />
              </div>
              <div className={styles.perfilAcciones}>
                <Link to="/perfil" className="btn-secondary">Editar perfil</Link>
                {usuario?.id && <Link to={`/perfil/${usuario.id}`} className={styles.linkSecundario}>Ver cómo me ven</Link>}
              </div>
            </Card>
          </div>

          {/* ── Ofertas para vos ───────────────────────────────────────────── */}
          <Card
            as="section"
            titleId="sec-ofertas"
            title="Ofertas para vos"
            subtitle="Según tu área de interés, habilidades y ubicación."
            actions={<Link to="/ofertas" className={styles.linkSecundario}>Ver todas</Link>}
          >
            {recomendadas.length === 0 ? (
              <EmptyState
                iconName="search"
                title="No hay recomendaciones nuevas."
                hint="Explorá todas las ofertas publicadas o completá tu perfil para recibir sugerencias."
              >
                <Link to="/ofertas" className="btn-primary">Explorar ofertas</Link>
              </EmptyState>
            ) : (
              <ul className={styles.ofertas}>
                {recomendadas.map((o) => (
                  <li key={o.id} className={styles.oferta}>
                    <div className={styles.ofertaInfo}>
                      <Link to={`/ofertas/${o.id}`} className={styles.ofertaTitulo}>{o.titulo}</Link>
                      <span className={styles.ofertaEmpresa}>{o.empresa?.razonSocial}</span>
                      <span className={styles.ofertaMeta}>
                        {o.ciudad && <span><Icon name="mapPin" size={14} /> {o.ciudad}</span>}
                        {o.modalidad && <span><Icon name="briefcase" size={14} /> {modalidadLabel(o.modalidad)}</span>}
                      </span>
                    </div>
                    <Link to={`/ofertas/${o.id}`} className={`btn-secondary ${styles.ofertaCta}`} aria-label={`Ver oferta: ${o.titulo}`}>
                      Ver oferta
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
