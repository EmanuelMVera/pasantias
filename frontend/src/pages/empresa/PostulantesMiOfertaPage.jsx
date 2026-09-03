/**
 * PostulantesMiOfertaPage.jsx — Vista de candidatos de una oferta.
 *
 * Ruta: /empresa/postulantes/:ofertaId
 *
 * Muestra la lista completa de postulantes con:
 * - Filtro por estado
 * - Selector de estado inline (dropdown) para avanzar candidatos
 * - CV descargable y carta de presentación
 * - Stats rápidas (total, en proceso, contratados)
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { postulacionService, abrirArchivoPrivado } from '../../services/api';
import Avatar from '../../components/Avatar/Avatar';
import Paginacion from '../../components/Paginacion/Paginacion';
import { LISTA_ESTADOS_POSTULACION, ESTADOS_HABILITAN_CHAT, getEstadoInfo, normalizarEstado } from '../../constants/postulacionEstados';
import styles from './PostulantesMiOfertaPage.module.css';

function formatFecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
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
  const [pagination,    setPagination]    = useState(null);
  const [conteoPorEstado, setConteoPorEstado] = useState({});
  const [page,          setPage]          = useState(1);

  const cargar = useCallback(async (pagina = 1) => {
    setLoading(true);
    try {
      const params = { page: pagina, limit: 20 };
      if (filtro) params.estado = filtro;
      const { data } = await postulacionService.getByOferta(ofertaId, params);
      setPostulaciones(data.data ?? []);
      setPagination(data.pagination ?? null);
      setConteoPorEstado(data.conteoPorEstado ?? {});
      setPage(pagina);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar los candidatos.');
    } finally {
      setLoading(false);
    }
  }, [ofertaId, filtro]);

  useEffect(() => { cargar(1); }, [cargar]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const handleCambiarEstado = async (id, nuevoEstado) => {
    setPostulaciones(prev => prev.map(p => p.id === id ? { ...p, estado: nuevoEstado } : p));
    try {
      await postulacionService.updateEstado(id, nuevoEstado);
      const e = getEstadoInfo(nuevoEstado);
      showToast(`${e.emoji} Candidato movido a "${e.label}"`);
    } catch {
      showToast('✗ Error al cambiar el estado.');
    } finally {
      cargar(page); // reconciliar lista + conteos + paginación
    }
  };

  const filtradas = postulaciones; // el filtro por estado ahora es server-side

  const total       = Object.values(conteoPorEstado).reduce((a, b) => a + b, 0);
  const activos     = total - (conteoPorEstado.rechazado ?? 0);
  const contratados = conteoPorEstado.contratado ?? 0;

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
              {LISTA_ESTADOS_POSTULACION.map(e => {
                const n = conteoPorEstado[e.estado] ?? 0;
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
                const cvArchivoId = perfil.cvArchivoId;
                const col    = getEstadoInfo(p.estado);
                return (
                  <div key={p.id} className={styles.candidatoCard}>
                    {/* Estado lateral */}
                    <div className={styles.estadoLateral} style={{ background: col?.color ?? '#64748b' }}>
                      <span>{col?.emoji}</span>
                    </div>

                    {/* Info principal */}
                    <div className={styles.candidatoBody}>
                      <div className={styles.candidatoTop}>
                        <Avatar
                          src={p.usuario?.perfil?.fotoPerfil ?? p.usuario?.fotoPerfil}
                          nombre={p.usuario?.nombre}
                          apellido={p.usuario?.apellido}
                          size={40}
                          color={col?.color ?? '#64748b'}
                          style={{ fontWeight: 800 }}
                        />
                        <div className={styles.candidatoInfo}>
                          <div className={styles.nombreRow}>
                            <strong>{p.usuario?.nombre} {p.usuario?.apellido}</strong>
                            {ESTADOS_HABILITAN_CHAT.includes(normalizarEstado(p.estado)) && p.usuario?.id && (
                              <button
                                className={styles.btnContactar}
                                onClick={() => navigate(`/chat/${p.usuario.id}`)}
                                title="Contactar a este candidato"
                                style={col?.color ? { background: col.color } : undefined}
                              >
                                💬 Contactar
                              </button>
                            )}
                            {p.usuario?.id && (
                              <button
                                className={styles.btnVerPerfil}
                                onClick={() => navigate(`/perfil/${p.usuario.id}`)}
                                title="Ver perfil del candidato"
                              >
                                👤 Ver perfil
                              </button>
                            )}
                          </div>
                          <span>{p.usuario?.email}</span>
                          {perfil.carrera && <span className={styles.carrera}>{perfil.carrera}</span>}
                        </div>
                        <div className={styles.candidatoMeta}>
                          {p.compatibilidadOferta != null && <CompatBar valor={p.compatibilidadOferta} />}
                          <span className={styles.fechaPost}>📅 {formatFecha(p.fechaPostulacion)}</span>
                        </div>
                      </div>

                      {/* Extras */}
                      <div className={styles.candidatoExtras}>
                        {cvArchivoId ? (
                          <button
                            type="button"
                            className={styles.btnCv}
                            onClick={() => abrirArchivoPrivado(cvArchivoId, { comoDescarga: true, nombreArchivo: `CV-${p.usuario?.nombre ?? 'candidato'}.pdf` })}
                          >
                            📄 Descargar CV
                          </button>
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
                        {LISTA_ESTADOS_POSTULACION.map(e => (
                          <option key={e.estado} value={e.estado}>{e.emoji} {e.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Paginacion pagination={pagination} onPageChange={cargar} />
        </>
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
