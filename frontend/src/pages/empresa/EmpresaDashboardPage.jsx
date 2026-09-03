/**
 * EmpresaDashboardPage.jsx — Panel principal de la empresa.
 *
 * Consume:
 *  GET /api/empresas/dashboard   — métricas (ofertas, postulaciones, equipo)
 *  GET /api/empresas/mis-ofertas — lista completa de ofertas PROPIAS con postulaciones
 *
 * Ruta: /empresa
 * Rol: empresa
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { empresaService, ofertaService } from '../../services/api';
import { useEmpresa } from '../../hooks/useEmpresa';
import Paginacion from '../../components/Paginacion/Paginacion';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import styles from './EmpresaDashboardPage.module.css';

/**
 * Configuración de tarjetas de métricas.
 * action: función que recibe { navigate, setFiltroOferta, tablaRef } y define la acción al hacer click.
 */
const METRIC_CARDS = [
  {
    key: 'ofertasActivas',  label: 'Ofertas Activas',   icon: '📢', color: 'var(--success)',
    action: ({ setFiltroOferta, tablaRef }) => { setFiltroOferta('activa'); tablaRef.current?.scrollIntoView({ behavior: 'smooth' }); },
  },
  {
    key: 'ofertasCerradas', label: 'Ofertas Cerradas',  icon: '🔒', color: 'var(--text-muted)',
    action: ({ setFiltroOferta, tablaRef }) => { setFiltroOferta('cerrada'); tablaRef.current?.scrollIntoView({ behavior: 'smooth' }); },
  },
  {
    key: 'postulaciones',   label: 'Postulaciones',     icon: '📋', color: 'var(--primary)',
    action: ({ navigate }) => navigate('/empresa/candidatos'),
  },
  {
    key: 'entrevistas',     label: 'Entrevistas',       icon: '🗓️', color: '#8e44ad',
    action: ({ navigate }) => navigate('/empresa/candidatos?estado=entrevista'),
  },
  {
    key: 'contrataciones',  label: 'Contrataciones',    icon: '🤝', color: '#16a085',
    action: ({ navigate }) => navigate('/empresa/candidatos?estado=contratado'),
  },
  {
    key: 'miembrosEquipo',  label: 'Equipo Reclutador', icon: '👥', color: 'var(--secondary)',
    action: ({ navigate }) => navigate('/empresa/equipo'),
  },
];

/* Colores de badge por estado de oferta */
const ESTADO_COLOR = {
  activa:    '#27ae60',
  pausada:   '#e67e22',
  rechazada: '#e74c3c',
  cerrada:   '#7f8c8d',
  pendiente: '#3498db',
};

const ESTADO_LABEL = {
  activa:    'Activa',
  pausada:   'Pausada',
  rechazada: 'Rechazada',
  cerrada:   'Cerrada',
};

export default function EmpresaDashboardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tablaRef = useRef(null);

  const [metricas,      setMetricas]      = useState(null);
  const [ofertas,       setOfertas]       = useState([]);
  const [paginationOfertas, setPaginationOfertas] = useState(null);
  const [pageOfertas,   setPageOfertas]   = useState(1);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [guardando,     setGuardando]     = useState(null);
  const [filtroOferta,  setFiltroOferta]  = useState(searchParams.get('filtro') ?? '');
  // EST-11: 'admin_empresa' | 'reclutador' — solo cambia el label de "Editar
  // empresa" (reclutador no puede editar, MiEmpresaPage ya lo restringe;
  // esto evita mostrarle un botón que dice "Editar" cuando en su caso es
  // de solo lectura). FE-05: viene de EmpresaContext, no de este fetch.
  const { esReclutador } = useEmpresa();
  const { toast, showToast } = useToast();

  const cargarMetricas = useCallback(async () => {
    setError('');
    try {
      const dashRes = await empresaService.getDashboard();
      const raw = dashRes.data?.data ?? dashRes.data ?? {};
      setMetricas({
        ofertasActivas:  raw.ofertas?.activas              ?? 0,
        ofertasCerradas: raw.ofertas?.cerradas             ?? 0,
        postulaciones:   raw.postulaciones?.total          ?? 0,
        entrevistas:     raw.postulaciones?.entrevistas    ?? 0,
        contrataciones:  raw.postulaciones?.contrataciones ?? 0,
        miembrosEquipo:  raw.equipo?.totalMiembros         ?? 0,
      });
    } catch (err) {
      setError(err.response?.data?.message ?? 'No se pudo cargar el panel.');
      console.error('Dashboard error:', err.response?.data ?? err.message);
    }
  }, []);

  const cargarOfertas = useCallback(async (estado, pagina = 1) => {
    setLoading(true);
    try {
      const params = { page: pagina, limit: 20 };
      if (estado) params.estado = estado;
      const res = await empresaService.getMisOfertas(params);
      setOfertas(res.data?.data ?? []);
      setPaginationOfertas(res.data?.pagination ?? null);
      setPageOfertas(pagina);
    } catch {
      // silencioso — el error global lo cubre cargarMetricas
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargarMetricas(); }, [cargarMetricas]);
  useEffect(() => { cargarOfertas(filtroOferta, 1); }, [filtroOferta, cargarOfertas]);

  /* Cambia estado de una oferta (pausar / activar / cerrar) */
  const handleCambiarEstado = async (id, estado) => {
    setGuardando(id);
    try {
      await ofertaService.update(id, { estado });
      setOfertas((prev) => prev.map((o) => (o.id === id ? { ...o, estado } : o)));
      // Actualiza la métrica de activas/cerradas sin recargar todo
      if (metricas) {
        setMetricas((m) => ({
          ...m,
          ofertasActivas:  estado === 'activa'  ? m.ofertasActivas + 1 : Math.max(0, m.ofertasActivas - 1),
          ofertasCerradas: estado === 'cerrada' ? m.ofertasCerradas + 1 : m.ofertasCerradas,
        }));
      }
      // Si hay filtro por estado activo, la fila puede haber salido de la página
      if (filtroOferta) cargarOfertas(filtroOferta, pageOfertas);
    } catch {
      showToast('Error al cambiar el estado de la oferta. Intentá de nuevo.', 'error');
    } finally {
      setGuardando(null);
    }
  };

  return (
    <div className="page-container">
      <Toast toast={toast} />

      {/* ── Cabecera ─────────────────────────────────────────────────────── */}
      <div className="dashboard-header">
        <h1>Panel de Empresa</h1>
        <div className={styles.headerActions}>
          <Link to="/empresa/mi-empresa" className="btn-secondary">
            {esReclutador ? '🏢 Ver empresa' : '🏢 Editar empresa'}
          </Link>
          <Link to="/empresa/seguridad"  className="btn-secondary">🔐 Seguridad</Link>
          <Link to="/empresa/equipo"     className="btn-secondary">👥 Equipo</Link>
          <Link to="/empresa/nueva-oferta" className="btn-primary">+ Nueva Oferta</Link>
        </div>
      </div>


      {/* Error global */}
      {error && <p className={`error-msg ${styles.errorGlobal}`}>⚠️ {error}</p>}

      {/* ── Tarjetas de métricas ──────────────────────────────────────────── */}
      {loading ? (
        <div className={styles.skeletonGrid}>
          {METRIC_CARDS.map((c) => <div key={c.key} className={styles.skeletonCard} />)}
        </div>
      ) : (
        <div className={styles.metricsGrid}>
          {METRIC_CARDS.map(({ key, label, icon, color, action }) => (
            <button
              key={key}
              className={`${styles.metricCard} ${styles.metricCardBtn}`}
              style={{ '--card-color': color }}
              onClick={() => action({ navigate, setFiltroOferta, tablaRef })}
              title={`Ver ${label.toLowerCase()}`}
            >
              <span className={styles.metricIcon}>{icon}</span>
              <span className={styles.metricValue}>{metricas?.[key] ?? '—'}</span>
              <span className={styles.metricLabel}>{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Tabla de ofertas propias ──────────────────────────────────────── */}
      <div className={`dashboard-header ${styles.subHeader}`} ref={tablaRef}>
        <h2>Mis Ofertas</h2>
        <div className={styles.subHeaderRight}>
          {filtroOferta && (
            <span className={styles.filtroTag}>
              Filtrando: <strong>{filtroOferta}</strong>
              <button
                className={styles.filtroTagClose}
                onClick={() => setFiltroOferta('')}
                aria-label="Quitar filtro"
              >✕</button>
            </span>
          )}
          <span className={styles.totalBadge}>
            {(() => {
              const n = paginationOfertas?.total ?? ofertas.length;
              return filtroOferta
                ? `${n} resultado${n !== 1 ? 's' : ''}`
                : `${n} publicada${n !== 1 ? 's' : ''}`;
            })()}
          </span>
        </div>
      </div>

      {loading ? (
        <p className="msg">Cargando ofertas...</p>
      ) : ofertas.length === 0 ? (
        <div className={styles.emptyState}>
          <span>📭</span>
          <p>Todavía no publicaste ninguna oferta.</p>
          <Link to="/empresa/nueva-oferta" className="btn-primary">Publicar primera oferta</Link>
        </div>
      ) : (
        <div className={styles.ofertasTablaWrap}>
          <table className="tabla">
            <thead>
              <tr>
                <th>Título</th>
                <th>Área / Modalidad</th>
                <th>Ciudad</th>
                <th>Estado</th>
                <th>Vacantes</th>
                <th>Postulados</th>
                <th>Candidatos</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ofertas.map((o) => (
                <tr key={o.id} className={guardando === o.id ? styles.rowGuardando : ''}>
                  <td>
                    <strong>{o.titulo}</strong>
                    {!o.moderada && (
                      <span className={styles.pendienteMod} title="Pendiente de moderación por el admin">
                        · ⏳ Pendiente
                      </span>
                    )}
                  </td>
                  <td>
                    <div>{o.area ?? '—'}</div>
                    {o.modalidad && <small className={styles.modalidadSmall}>{o.modalidad}</small>}
                  </td>
                  <td>{o.ciudad || '—'}</td>
                  <td>
                    <span
                      className="badge"
                      style={{ background: ESTADO_COLOR[o.estado] ?? '#7f8c8d' }}
                      title={o.estado === 'rechazada' ? 'Esta oferta fue rechazada por el administrador.' : undefined}
                    >
                      {ESTADO_LABEL[o.estado] ?? o.estado}
                    </span>
                  </td>
                  <td className={styles.centrado}>{o.cantidadVacantes ?? '—'}</td>
                  <td className={styles.centrado}>
                    <strong className={`${styles.postuladosCount} ${o.totalPostulaciones > 0 ? styles.tienen : ''}`}>
                      {o.totalPostulaciones ?? 0}
                    </strong>
                  </td>
                  <td>
                    <Link to={`/empresa/postulantes/${o.id}`} className="btn-small">
                      Ver candidatos
                    </Link>
                  </td>
                  <td className={styles.accionesTd}>
                    {guardando === o.id ? (
                      <span className={styles.guardandoSpan}>Guardando...</span>
                    ) : (
                      <>
                        {o.estado === 'activa' && (
                          <>
                            <button
                              className="btn-warn"
                              onClick={() => handleCambiarEstado(o.id, 'pausada')}
                            >
                              Pausar
                            </button>
                            <button
                              className="btn-danger"
                              onClick={() => handleCambiarEstado(o.id, 'cerrada')}
                            >
                              Cerrar
                            </button>
                          </>
                        )}
                        {o.estado === 'pausada' && (
                          <button
                            className="btn-ok"
                            onClick={() => handleCambiarEstado(o.id, 'activa')}
                          >
                            Activar
                          </button>
                        )}
                        {o.estado === 'rechazada' && (
                          <span
                            className={`${styles.estadoNota} ${styles.rechazada}`}
                            title="Contactá al administrador para más información."
                          >
                            Revisada por admin
                          </span>
                        )}
                        {o.estado === 'cerrada' && (
                          <span className={styles.estadoNota}>—</span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Paginacion
            pagination={paginationOfertas}
            onPageChange={(p) => cargarOfertas(filtroOferta, p)}
          />
        </div>
      )}
    </div>
  );
}
