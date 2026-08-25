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
import styles from './MisPostulacionesPage.module.css';

// Mapa de estados para display en badges (EST-08: sin aliases legacy —
// el backend consolidó entrevista_programada→entrevista y no_seleccionado→rechazado)
const ESTADOS = {
  en_revision:     { label: 'En revisión',     color: '#f59e0b', icon: '🔍', bg: '#fffbeb' },
  preseleccionado: { label: 'Preseleccionado', color: '#3b82f6', icon: '✅', bg: '#eff6ff' },
  entrevista:      { label: 'Entrevista',      color: '#8b5cf6', icon: '🗓️', bg: '#f5f3ff' },
  rechazado:       { label: 'No seleccionado', color: '#ef4444', icon: '❌', bg: '#fef2f2' },
  contratado:      { label: '¡Contratado!',    color: '#10b981', icon: '🎉', bg: '#ecfdf5' },
};

const ESTADOS_RESUMEN = [
  { key: 'en_revision',     aliases: [], label: 'En revisión',     color: '#f59e0b', icon: '🔍', bg: '#fffbeb' },
  { key: 'preseleccionado', aliases: [], label: 'Preseleccionado', color: '#3b82f6', icon: '✅', bg: '#eff6ff' },
  { key: 'entrevista',      aliases: [], label: 'Entrevista',      color: '#8b5cf6', icon: '🗓️', bg: '#f5f3ff' },
  { key: 'contratado',      aliases: [], label: '¡Contratado!',    color: '#10b981', icon: '🎉', bg: '#ecfdf5' },
  { key: 'rechazado',       aliases: [], label: 'No seleccionado', color: '#ef4444', icon: '❌', bg: '#fef2f2' },
];

// Estados que habilitan el chat con el reclutador
const ESTADOS_CHAT = ['preseleccionado', 'entrevista', 'contratado'];

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
  const [successMsg, setSuccessMsg]       = useState('');

  const cargar = useCallback(() => {
    setLoading(true);
    postulacionService.getMias()
      .then(({ data }) => setPostulaciones(data.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Filtrar incluyendo aliases legacy cuando el filtro activo es un estado canónico
  const filtroCanonInfo = ESTADOS_RESUMEN.find(e => e.key === filtroEstado);
  const filtradas = filtroEstado
    ? postulaciones.filter((p) =>
        p.estado === filtroEstado || (filtroCanonInfo?.aliases.includes(p.estado) ?? false)
      )
    : postulaciones;

  // Conteo agrupado: alias legacy se suma al estado canónico correspondiente
  const conteoCanonicos = ESTADOS_RESUMEN.reduce((acc, e) => {
    acc[e.key] = postulaciones.filter(p =>
      p.estado === e.key || e.aliases.includes(p.estado)
    ).length;
    return acc;
  }, {});

  if (loading) {
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

      {postulaciones.length === 0 ? (
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
            {ESTADOS_RESUMEN.map((e) => (
              <button
                key={e.key}
                className={`${styles.resumenCard} ${filtroEstado === e.key ? styles.resumenCardActive : ''}`}
                style={filtroEstado === e.key ? { borderColor: e.color, background: e.bg } : {}}
                onClick={() => setFiltroEstado(filtroEstado === e.key ? '' : e.key)}
              >
                <span className={styles.resumenIcon}>{e.icon}</span>
                <span className={styles.resumenCount} style={filtroEstado === e.key ? { color: e.color } : {}}>
                  {conteoCanonicos[e.key] ?? 0}
                </span>
                <span className={styles.resumenLabel}>{e.label}</span>
              </button>
            ))}
          </div>

          {/* Indicador de filtro activo */}
          {filtroEstado && (
            <div className={styles.filtroActivo}>
              Mostrando: <strong>{filtroCanonInfo?.label ?? ESTADOS[filtroEstado]?.label}</strong>
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
                const estado = ESTADOS[p.estado] ?? {
                  label: p.estado, color: '#6b7280', icon: '❓', bg: '#f9fafb',
                };

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
                        {estado.icon} {estado.label}
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
                      {ESTADOS_CHAT.includes(p.estado) && p.oferta?.empresa?.usuarioId && (
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
        </>
      )}
    </div>
  );
}
