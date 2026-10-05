/**
 * MisPostulacionesPage.jsx — Postulaciones del alumno/egresado.
 *
 * Ruta: /mis-postulaciones[?estado=<estado>] (roles alumno, egresado)
 * Consume: GET /api/postulaciones/mis (paginado, filtro por estado server-side,
 * `conteoPorEstado` global para el resumen).
 *
 * - El resumen por estado funciona como filtro; el estado vive en la URL para
 *   que el Inicio pueda enlazar directo (p. ej. ?estado=entrevista).
 * - ?grupo=en_proceso (KPI "En proceso" del Inicio): en revisión +
 *   preseleccionado. Es una agrupación de presentación — los estados reales
 *   de la BD no cambian; el backend filtra con GET /mis?grupo=en_proceso.
 * - Cada postulación: oferta, empresa, estado, fechas y aviso si la oferta ya
 *   no está publicada (pausada/cerrada: el proceso puede seguir igual).
 * - "Chatear con el reclutador" solo cuando el estado lo habilita
 *   (preseleccionado, entrevista, contratado) y la oferta tiene responsable:
 *   es quien realmente puede chatear con el candidato (reglas de chat).
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { postulacionService } from '../../services/postulacion.service';
import Paginacion from '../../components/Paginacion/Paginacion';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import Icon from '../../components/ui/Icon';
import {
  ESTADOS_HABILITAN_CHAT, LISTA_ESTADOS_POSTULACION, getEstadoInfo, normalizarEstado,
} from '../../constants/postulacionEstados';
import { formatFecha, modalidadLabel } from '../../utils/ofertaPresentacion';
import styles from './MisPostulacionesPage.module.css';

const ESTADOS_VALIDOS = LISTA_ESTADOS_POSTULACION.map((e) => e.estado);

/** Agrupaciones de presentación (espejo de postulacion.service::GRUPOS_ESTADO). */
const GRUPOS = {
  en_proceso: { label: 'En proceso', detalle: 'en revisión y preseleccionado', estados: ['en_revision', 'preseleccionado'] },
};

export default function MisPostulacionesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const estadoUrl = searchParams.get('estado') ?? '';
  const grupoUrl = searchParams.get('grupo') ?? '';
  const filtroGrupo = GRUPOS[grupoUrl] ? grupoUrl : '';
  // El grupo gana sobre el estado (igual que en el backend).
  const filtroEstado = !filtroGrupo && ESTADOS_VALIDOS.includes(estadoUrl) ? estadoUrl : '';

  const [postulaciones, setPostulaciones] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [conteoPorEstado, setConteoPorEstado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback((pagina = 1) => {
    const params = { page: pagina, limit: 20 };
    if (filtroGrupo) params.grupo = filtroGrupo;
    else if (filtroEstado) params.estado = filtroEstado;
    postulacionService.getMias(params)
      .then(({ data }) => {
        setPostulaciones(data.data ?? []);
        setPagination(data.pagination ?? null);
        setConteoPorEstado(data.conteoPorEstado ?? {});
        setError('');
      })
      .catch(() => setError('No se pudieron cargar tus postulaciones.'))
      .finally(() => setLoading(false));
  }, [filtroEstado, filtroGrupo]);

  useEffect(() => { cargar(1); }, [cargar]);

  // `loading` se prende en los eventos (no dentro de cargar): cargar corre en
  // un efecto y no debe setear estado sincrónicamente.
  const irAPagina = (pagina) => { setLoading(true); cargar(pagina); };

  const setFiltro = (estado) => {
    setLoading(true);
    const sig = new URLSearchParams(searchParams);
    sig.delete('grupo');
    if (estado) sig.set('estado', estado); else sig.delete('estado');
    setSearchParams(sig, { replace: true });
  };

  const totalGlobal = conteoPorEstado ? Object.values(conteoPorEstado).reduce((a, b) => a + b, 0) : null;
  const sinPostulaciones = totalGlobal === 0;

  return (
    <div className="page-container">
      <PageHeader
        title="Mis postulaciones"
        subtitle="Seguí el estado de cada proceso de selección."
        actions={!sinPostulaciones && <Link to="/ofertas" className="btn-secondary">Explorar ofertas</Link>}
      />

      {error && <p className="error-msg" role="alert">{error}</p>}

      {conteoPorEstado === null ? (
        loading && (
          <div className={styles.loadingList} aria-hidden="true">
            {[1, 2, 3].map((i) => <div key={i} className={styles.skeletonCard} />)}
          </div>
        )
      ) : sinPostulaciones ? (
        <EmptyState
          iconName="briefcase"
          title="Todavía no te postulaste a ninguna oferta."
          hint="Explorá las ofertas disponibles y postulate a las que se ajusten a tu perfil."
        >
          <Link to="/ofertas" className="btn-primary">Ver ofertas disponibles</Link>
        </EmptyState>
      ) : (
        <>
          {/* ── Resumen por estado (funciona como filtro) ──────────────────── */}
          <div className={styles.resumenGrid} role="group" aria-label="Filtrar por estado">
            {LISTA_ESTADOS_POSTULACION.map((e) => {
              const activo = filtroEstado === e.estado || Boolean(filtroGrupo && GRUPOS[filtroGrupo].estados.includes(e.estado));
              return (
                <button
                  key={e.estado}
                  type="button"
                  className={`${styles.resumenCard} ${styles[`tono_${e.tone}`]} ${activo ? styles.resumenActivo : ''}`}
                  aria-pressed={activo}
                  onClick={() => setFiltro(activo ? '' : e.estado)}
                >
                  <span className={styles.resumenIcono}><Icon name={e.icon} size={18} /></span>
                  <span className={styles.resumenCount}>{conteoPorEstado[e.estado] ?? 0}</span>
                  <span className={styles.resumenLabel}>{e.label}</span>
                </button>
              );
            })}
          </div>

          {filtroGrupo && (
            <div className={styles.filtroActivo}>
              Mostrando: <strong>{GRUPOS[filtroGrupo].label}</strong> ({GRUPOS[filtroGrupo].detalle})
              <button type="button" className={styles.limpiarFiltro} onClick={() => setFiltro('')}>
                <Icon name="close" size={14} /> Ver todas
              </button>
            </div>
          )}

          {filtroEstado && (
            <div className={styles.filtroActivo}>
              Mostrando: <strong>{getEstadoInfo(filtroEstado).label}</strong>
              <button type="button" className={styles.limpiarFiltro} onClick={() => setFiltro('')}>
                <Icon name="close" size={14} /> Ver todas
              </button>
            </div>
          )}

          {/* ── Lista ──────────────────────────────────────────────────────── */}
          <div className={styles.postulacionesList} aria-busy={loading}>
            {postulaciones.length === 0 && !loading ? (
              <p className={styles.sinResultados}>No tenés postulaciones en este estado.</p>
            ) : (
              postulaciones.map((p) => {
                const estado = getEstadoInfo(p.estado);
                const o = p.oferta;
                const chat = ESTADOS_HABILITAN_CHAT.includes(normalizarEstado(p.estado)) && o?.creadaPorUsuarioId;
                return (
                  <article key={p.id} className={`${styles.postulacionCard} ${styles[`borde_${estado.tone}`]}`}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitulos}>
                        <h2 className={styles.ofertaTitulo}>{o?.titulo ?? 'Oferta eliminada'}</h2>
                        <p className={styles.empresaNombre}>
                          {o?.empresaId
                            ? <Link to={`/empresa/${o.empresaId}`}>{o.empresa?.razonSocial ?? '—'}</Link>
                            : (o?.empresa?.razonSocial ?? '—')}
                        </p>
                      </div>
                      <span className={`badge badge-tone-${estado.tone} ${styles.estadoBadge}`}>{estado.label}</span>
                    </div>

                    <ul className={styles.cardMeta}>
                      <li><Icon name="calendar" size={14} /> Postulado el {formatFecha(p.fechaPostulacion ?? p.createdAt)}</li>
                      {p.ultimaActualizacion && (
                        <li><Icon name="refresh" size={14} /> Actualizado el {formatFecha(p.ultimaActualizacion)}</li>
                      )}
                      {o?.ciudad && <li><Icon name="mapPin" size={14} /> {o.ciudad}</li>}
                      {o?.modalidad && <li><Icon name="briefcase" size={14} /> {modalidadLabel(o.modalidad)}</li>}
                    </ul>

                    {o && o.estado !== 'activa' && (
                      <p className={styles.avisoOferta}>
                        <Icon name="info" size={14} />
                        {o.estado === 'cerrada'
                          ? 'La oferta ya no recibe postulaciones; tu proceso puede seguir.'
                          : 'La oferta está pausada por la empresa.'}
                      </p>
                    )}

                    <div className={styles.cardActions}>
                      {o?.id && (
                        <Link to={`/ofertas/${o.id}`} className="btn-secondary">Ver oferta</Link>
                      )}
                      {chat && (
                        <Link to={`/chat/${o.creadaPorUsuarioId}`} className="btn-primary" title="Chatear con el reclutador responsable de esta oferta">
                          <Icon name="message" size={16} /> Chatear con el reclutador
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>

          <Paginacion pagination={pagination} onPageChange={irAPagina} />
        </>
      )}
    </div>
  );
}
