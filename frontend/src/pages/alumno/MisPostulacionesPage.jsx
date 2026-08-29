/**
 * MisPostulacionesPage.jsx — Lista de postulaciones del alumno/egresado.
 *
 * Muestra todas las postulaciones del usuario con:
 * - Estado actual (en_revision, preseleccionado, entrevista, contratado, rechazado)
 * - Fecha de última actualización
 * - Observaciones de la empresa (si existen)
 * - Botón "💬 Chatear con reclutador" solo cuando el estado lo habilita
 *   (preseleccionado, entrevista, contratado)
 *
 * Ruta: /mis-postulaciones
 * Roles: alumno, egresado
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { postulacionService } from '../../services/api';
import Paginacion from '../../components/Paginacion/Paginacion';
import { LISTA_ESTADOS_POSTULACION, ESTADOS_HABILITAN_CHAT, getEstadoInfo, normalizarEstado } from '../../constants/postulacionEstados';
import styles from './MisPostulacionesPage.module.css';

function formatFecha(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function formatFechaHora(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/* ── Componente principal ────────────────────────────────────────────────────── */
export default function MisPostulacionesPage() {
  const [postulaciones, setPostulaciones] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [filtroEstado, setFiltroEstado]   = useState('');
  const [successMsg]                      = useState('');
  const [pagination, setPagination]       = useState(null);
  const [conteoPorEstado, setConteoPorEstado] = useState({});

  const cargar = useCallback((pagina = 1) => {
    const params = { page: pagina, limit: 20 };
    if (filtroEstado) params.estado = filtroEstado;
    postulacionService.getMias(params)
      .then(({ data }) => {
        setPostulaciones(data.data ?? []);
        setPagination(data.pagination ?? null);
        setConteoPorEstado(data.conteoPorEstado ?? {});
      })
      .finally(() => setLoading(false));
  }, [filtroEstado]);

  useEffect(() => { cargar(1); }, [cargar]);

  const filtradas = postulaciones; // el filtro por estado ahora es server-side
  const conteoCanonicos = conteoPorEstado;
  const totalGlobal = Object.values(conteoPorEstado).reduce((a, b) => a + b, 0);

  if (loading && !pagination) {
    return (
      <div className="page-container">
        <h1>Mis Postulaciones</h1>
        <div className={styles.loadingList}>
          {[1,2,3].map(i => <div key={i} className={styles.skeletonCard} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="dashboard-header">
        <h1>Mis Postulaciones</h1>
        <Link to="/ofertas" className="btn-primary">
          🔍 Ver más ofertas
        </Link>
      </div>

      {/* Mensaje de éxito */}
      {successMsg && (
        <div className={styles.successBanner}>
          ✅ {successMsg}
        </div>
      )}

      {totalGlobal === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📋</span>
          <h3>Todavía no te postulaste a ninguna oferta</h3>
          <p>Explorá las ofertas disponibles y postulate a las que se ajusten a tu perfil.</p>
          <Link to="/ofertas" className="btn-primary">Ver ofertas disponibles</Link>
        </div>
      ) : (
        <>
          {/* ── Resumen visual ───────────────────────────────────────────── */}
          <div className={styles.resumenGrid}>
            {LISTA_ESTADOS_POSTULACION.map((e) => (
              <button
                key={e.estado}
                className={`${styles.resumenCard} ${filtroEstado === e.estado ? styles.resumenCardActive : ''}`}
                style={filtroEstado === e.estado ? { borderColor: e.color, background: e.bg } : {}}
                onClick={() => setFiltroEstado(filtroEstado === e.estado ? '' : e.estado)}
              >
                <span className={styles.resumenIcon}>{e.emoji}</span>
                <span className={styles.resumenCount} style={filtroEstado === e.estado ? { color: e.color } : {}}>
                  {conteoCanonicos[e.estado] ?? 0}
                </span>
                <span className={styles.resumenLabel}>{e.label}</span>
              </button>
            ))}
          </div>

          {/* Indicador de filtro activo */}
          {filtroEstado && (
            <div className={styles.filtroActivo}>
              Mostrando: <strong>{getEstadoInfo(filtroEstado).label}</strong>
              <button className={styles.limpiarFiltro} onClick={() => setFiltroEstado('')}>
                ✕ Limpiar filtro
              </button>
            </div>
          )}

          {/* ── Lista de postulaciones ───────────────────────────────────── */}
          <div className={styles.postulacionesList}>
            {filtradas.length === 0 ? (
              <p className={styles.sinResultados}>No hay postulaciones con ese estado.</p>
            ) : (
              filtradas.map((p) => {
                const estado = getEstadoInfo(p.estado);

                return (
                  <div
                    key={p.id}
                    className={styles.postulacionCard}
                    style={{ borderLeftColor: estado.color }}
                  >
                    {/* Cabecera: oferta + empresa + estado */}
                    <div className={styles.cardHeader}>
                      <div>
                        <h3 className={styles.ofertaTitulo}>
                          {p.oferta?.titulo ?? 'Oferta eliminada'}
                        </h3>
                        <p className={styles.empresaNombre}>
                          {p.oferta?.empresa?.razonSocial ?? '—'}
                        </p>
                      </div>
                      <span
                        className={styles.estadoBadge}
                        style={{ background: estado.bg, color: estado.color, border: `1px solid ${estado.color}` }}
                      >
                        {estado.emoji} {estado.label}
                      </span>
                    </div>

                    {/* Fechas y detalles */}
                    <div className={styles.cardMeta}>
                      <span>📅 Postulado el {formatFecha(p.fechaPostulacion ?? p.createdAt)}</span>
                      {p.ultimaActualizacion && (
                        <span>🔄 Actualizado: {formatFechaHora(p.ultimaActualizacion)}</span>
                      )}
                      {p.oferta?.ciudad    && <span>📍 {p.oferta.ciudad}</span>}
                      {p.oferta?.modalidad && <span>💼 {p.oferta.modalidad}</span>}
                    </div>

                    {/* Observaciones de la empresa */}
                    {p.observacionesEmpresa && (
                      <div className={styles.observaciones}>
                        <span className={styles.observacionesLabel}>💬 Comentario de la empresa:</span>
                        <p className={styles.observacionesTexto}>{p.observacionesEmpresa}</p>
                      </div>
                    )}

                    {/* Acciones */}
                    <div className={styles.cardActions}>
                      {p.oferta?.id && (
                        <Link to={`/ofertas/${p.oferta.id}`} className="btn-small">
                          Ver oferta
                        </Link>
                      )}
                      {/* Chat: solo cuando la postulación está en estado activo */}
                      {ESTADOS_HABILITAN_CHAT.includes(normalizarEstado(p.estado)) && p.oferta?.empresa?.usuarioId && (
                        <Link
                          to={`/chat/${p.oferta.empresa.usuarioId}`}
                          className={styles.btnChat}
                          title="Chatear con el reclutador de esta empresa"
                        >
                          💬 Chatear con reclutador
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <Paginacion pagination={pagination} onPageChange={cargar} />
        </>
      )}
    </div>
  );
}
