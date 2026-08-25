/**
 * PostulantesMiOfertaPage.jsx — Vista de candidatos de una oferta.
 *
 * Ruta: /empresa/postulantes/:ofertaId
 *
 * Muestra la lista completa de postulantes con:
 * - Filtro por estado
 * - Selector de estado inline (dropdown) para avanzar candidatos
 * - CV descargable, carta de presentación y badge de aval
 * - Stats rápidas (total, en proceso, contratados)
 */

import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { postulacionService, getArchivoUrl } from '../../services/api';
import styles from './PostulantesMiOfertaPage.module.css';

/* ── Configuración de estados ────────────────────────────────────────────────── */
// EST-08: el backend consolidó los pares legacy/alias
// (entrevista_programada→entrevista, no_seleccionado→rechazado).
const ESTADO_MAP = {
  en_revision:     { label: 'En revisión',     emoji: '📥', color: '#64748b', bg: '#f1f5f9' },
  preseleccionado: { label: 'Preseleccionado', emoji: '⭐', color: '#2563eb', bg: '#eff6ff' },
  entrevista:      { label: 'Entrevista',      emoji: '🎙️', color: '#7c3aed', bg: '#f5f3ff' },
  contratado:      { label: 'Contratado',      emoji: '🎉', color: '#16a34a', bg: '#f0fdf4' },
  rechazado:       { label: 'No seleccionado', emoji: '✕',  color: '#dc2626', bg: '#fef2f2' },
};

const ESTADOS_CANONICOS = [
  { estado: 'en_revision',     aliases: [], label: 'En revisión',    emoji: '📥', color: '#64748b', bg: '#f1f5f9' },
  { estado: 'preseleccionado', aliases: [], label: 'Preseleccionado',emoji: '⭐', color: '#2563eb', bg: '#eff6ff' },
  { estado: 'entrevista',      aliases: [], label: 'Entrevista',     emoji: '🎙️', color: '#7c3aed', bg: '#f5f3ff' },
  { estado: 'contratado',      aliases: [], label: 'Contratado',     emoji: '🎉', color: '#16a34a', bg: '#f0fdf4' },
  { estado: 'rechazado',       aliases: [], label: 'No seleccionado',emoji: '✕',  color: '#dc2626', bg: '#fef2f2' },
];

// Estados que habilitan el botón de contacto/chat con el candidato
const ESTADOS_CHAT_EMPRESA = ['preseleccionado', 'entrevista', 'contratado'];

function formatFecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ── Avatar de candidato con foto o inicial ─────────────────────────────────── */
function CandidatoAvatar({ fotoSrc, nombre, color }) {
  const [error, setError] = useState(false);
  const inicial = (nombre?.[0] ?? '?').toUpperCase();
  return (
    <div className={styles.candidatoAvatar} style={{ background: color, overflow: 'hidden' }}>
      {fotoSrc && !error
        ? <img src={fotoSrc} alt={nombre} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={() => setError(true)} />
        : inicial
      }
    </div>
  );
}

/* ── Badge de aval ───────────────────────────────────────────────────────────── */
function AvalBadge({ avales = [] }) {
  if (!avales?.length) return (
    <span className={styles.avalBadge} style={{ background: '#f1f5f9', color: '#94a3b8' }}>Sin aval</span>
  );
  const aprobado  = avales.find(a => a.estado === 'aprobado');
  const pendiente = avales.find(a => a.estado === 'pendiente');
  if (aprobado)  return <span className={styles.avalBadge} style={{ background: '#dcfce7', color: '#16a34a' }}>🎓 Aval aprobado</span>;
  if (pendiente) return <span className={styles.avalBadge} style={{ background: '#fef9c3', color: '#ca8a04' }}>⏳ Aval pendiente</span>;
  return <span className={styles.avalBadge} style={{ background: '#fee2e2', color: '#dc2626' }}>✕ Aval rechazado</span>;
}

/* ── Barra de compatibilidad ─────────────────────────────────────────────────── */
function CompatBar({ valor }) {
  const pct   = Math.min(Math.max(Number(valor) || 0, 0), 100);
  const color = pct >= 75 ? '#16a34a' : pct >= 50 ? '#ea580c' : '#dc2626';
  return (
    <div className={styles.compatWrap}>
      <div className={styles.compatBar}>
        <div className={styles.compatFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={styles.compatPct} style={{ color }}>{pct}%</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════════════════════════════════════════════ */
export default function PostulantesMiOfertaPage() {
  const { ofertaId } = useParams();
  const navigate = useNavigate();

  const [postulaciones, setPostulaciones] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [filtro,        setFiltro]        = useState('');
  const [toast,         setToast]         = useState('');

  useEffect(() => {
    postulacionService
      .getByOferta(ofertaId)
      .then(({ data }) => setPostulaciones(data.data ?? data ?? []))
      .catch(err => setError(err.response?.data?.message ?? 'Error al cargar los candidatos.'))
      .finally(() => setLoading(false));
  }, [ofertaId]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const handleCambiarEstado = async (id, nuevoEstado) => {
    // Actualización optimista
    setPostulaciones(prev => prev.map(p => p.id === id ? { ...p, estado: nuevoEstado } : p));
    try {
      await postulacionService.updateEstado(id, nuevoEstado);
      const e = ESTADO_MAP[nuevoEstado];
      showToast(`${e?.emoji ?? ''} Candidato movido a "${e?.label ?? nuevoEstado}"`);
    } catch {
      showToast('✗ Error al cambiar el estado.');
    }
  };

  const filtradas = filtro
    ? postulaciones.filter(p => p.estado === filtro)
    : postulaciones;

  const total       = postulaciones.length;
  const activos     = postulaciones.filter(p => p.estado !== 'rechazado').length;
  const contratados = postulaciones.filter(p => p.estado === 'contratado').length;

  return (
    <div className="page-container">

      {/* ── Cabecera ──────────────────────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <Link to="/empresa" className="btn-back">← Volver al panel</Link>
          <h1>Candidatos</h1>
          <p className={styles.pageSubtitle}>
            Revisá y gestioná los postulantes a esta oferta.
          </p>
        </div>

        {/* Stats rápidas */}
        <div className={styles.headerStats}>
          <div className={styles.statPill}>
            <span className={styles.statNum}>{total}</span>
            <span>Total</span>
          </div>
          <div className={styles.statPill}>
            <span className={styles.statNum} style={{ color: '#2563eb' }}>{activos}</span>
            <span>En proceso</span>
          </div>
          <div className={styles.statPill}>
            <span className={styles.statNum} style={{ color: '#16a34a' }}>{contratados}</span>
            <span>Contratados</span>
          </div>
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && <p className={styles.errorMsg}>{error}</p>}

      {/* ── Loading ───────────────────────────────────────────────────────── */}
      {loading && (
        <div className={styles.skeletonKanban}>
          {[1,2,3].map(i => <div key={i} className={styles.skeletonCol} />)}
        </div>
      )}

      {/* ── Estado vacío ──────────────────────────────────────────────────── */}
      {!loading && total === 0 && (
        <div className={styles.emptyState}>
          <span>📭</span>
          <p>No hay postulantes para esta oferta todavía.</p>
        </div>
      )}

      {/* ── Lista de candidatos ───────────────────────────────────────────── */}
      {!loading && total > 0 && (
        <>
          {/* Filtros por estado */}
          <div className={styles.filtroBar}>
            <label>Filtrar:</label>
            <div className={styles.filtroChips}>
              <button
                className={`${styles.filtroChip} ${!filtro ? styles.filtroChipActive : ''}`}
                onClick={() => setFiltro('')}
              >
                Todos ({total})
              </button>
              {ESTADOS_CANONICOS.map(e => {
                // Contar estado canónico + sus aliases legacy
                const n = postulaciones.filter(p =>
                  p.estado === e.estado || e.aliases.includes(p.estado)
                ).length;
                if (!n) return null;
                return (
                  <button
                    key={e.estado}
                    className={`${styles.filtroChip} ${filtro === e.estado ? styles.filtroChipActive : ''}`}
                    style={filtro === e.estado ? { borderColor: e.color, background: e.bg, color: e.color } : {}}
                    onClick={() => setFiltro(filtro === e.estado ? '' : e.estado)}
                  >
                    {e.emoji} {e.label} ({n})
                  </button>
                );
              })}
            </div>
          </div>

          {filtradas.length === 0 ? (
            <div className={styles.emptyState}>
              <span>📭</span>
              <p>No hay candidatos con ese estado.</p>
            </div>
          ) : (
            <div className={styles.listaCards}>
              {filtradas.map(p => {
                const perfil = p.usuario?.perfil ?? {};
                const cvUrl  = getArchivoUrl(perfil.cvPath);
                const col    = ESTADO_MAP[p.estado];
                return (
                  <div key={p.id} className={styles.candidatoCard}>
                    {/* Estado lateral */}
                    <div className={styles.estadoLateral} style={{ background: col?.color ?? '#64748b' }}>
                      <span>{col?.emoji}</span>
                    </div>

                    {/* Info principal */}
                    <div className={styles.candidatoBody}>
                      <div className={styles.candidatoTop}>
                        <CandidatoAvatar
                          fotoSrc={p.usuario?.perfil?.fotoPerfil ?? p.usuario?.fotoPerfil}
                          nombre={p.usuario?.nombre}
                          color={col?.color ?? '#64748b'}
                        />
                        <div className={styles.candidatoInfo}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <strong>{p.usuario?.nombre} {p.usuario?.apellido}</strong>
                            {ESTADOS_CHAT_EMPRESA.includes(p.estado) && p.usuario?.id && (
                              <button
                                onClick={() => navigate(`/chat/${p.usuario.id}`)}
                                title="Contactar a este candidato"
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                  background: col?.color ?? '#2563eb', color: '#fff',
                                  border: 'none', borderRadius: '20px',
                                  padding: '2px 10px', fontSize: '0.75rem',
                                  fontWeight: 600, cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                💬 Contactar
                              </button>
                            )}
                            {p.usuario?.id && (
                              <button
                                onClick={() => navigate(`/perfil/${p.usuario.id}`)}
                                title="Ver perfil del candidato"
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                  background: '#f1f5f9', color: '#475569',
                                  border: '1px solid #cbd5e1', borderRadius: '20px',
                                  padding: '2px 10px', fontSize: '0.75rem',
                                  fontWeight: 600, cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                👤 Ver perfil
                              </button>
                            )}
                          </div>
                          <span>{p.usuario?.email}</span>
                          {perfil.carrera && <span className={styles.carrera}>{perfil.carrera}</span>}
                        </div>
                        <div className={styles.candidatoMeta}>
                          <AvalBadge avales={p.avales} />
                          {p.compatibilidadOferta != null && <CompatBar valor={p.compatibilidadOferta} />}
                          <span className={styles.fechaPost}>📅 {formatFecha(p.fechaPostulacion)}</span>
                        </div>
                      </div>

                      {/* Extras */}
                      <div className={styles.candidatoExtras}>
                        {cvUrl ? (
                          <a href={cvUrl} target="_blank" rel="noreferrer" download className={styles.btnCv}>
                            📄 Descargar CV
                          </a>
                        ) : (
                          <span className={styles.sinCv}>Sin CV</span>
                        )}
                        {p.cartaPresentacion && (
                          <details className={styles.carta}>
                            <summary>📝 Carta de presentación</summary>
                            <p>{p.cartaPresentacion}</p>
                          </details>
                        )}
                      </div>
                    </div>

                    {/* Selector de estado */}
                    <div className={styles.selectorEstado}>
                      <label>Estado</label>
                      <select
                        value={p.estado}
                        onChange={e => handleCambiarEstado(p.id, e.target.value)}
                        style={{ borderColor: col?.color ?? 'var(--border)' }}
                      >
                        {ESTADOS_CANONICOS.map(e => (
                          <option key={e.estado} value={e.estado}>{e.emoji} {e.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
