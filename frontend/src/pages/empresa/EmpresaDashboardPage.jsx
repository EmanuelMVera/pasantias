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
import { useAuth } from '../../hooks/useAuth';
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
    key: 'miembrosEquipo',  label: 'Miembros del equipo', icon: '👥', color: 'var(--secondary)',
    action: ({ navigate }) => navigate('/empresa/equipo'),
  },
];

// Orden de tarjetas para el reclutador: lo operativo (candidatos/entrevistas/
// ofertas) primero — lo estratégico (equipo) al final. Ninguna tarjeta se
// oculta (ambos roles tienen acceso legítimo a todos estos datos), solo
// cambia el orden de lectura. admin_empresa mantiene el orden por defecto
// (empresa/equipo primero).
const ORDEN_RECLUTADOR = ['postulaciones', 'entrevistas', 'contrataciones', 'ofertasActivas', 'ofertasCerradas', 'miembrosEquipo'];

/* Colores/labels de badge por estado de ciclo de vida de la oferta */
const ESTADO_COLOR = {
  activa:  '#27ae60',
  pausada: '#e67e22',
  cerrada: '#7f8c8d',
};

const ESTADO_LABEL = {
  activa:  'Activa',
  pausada: 'Pausada',
  cerrada: 'Cerrada',
};

/* Colores/labels de badge por estado de moderación (eje independiente,
   RBAC-04 — reemplaza el booleano `moderada`) */
const MODERACION_COLOR = {
  pendiente:     '#3498db',
  aprobada:      '#27ae60',
  auto_aprobada: '#16a085',
  rechazada:     '#e74c3c',
};

const MODERACION_LABEL = {
  pendiente:     'Pendiente de revisión',
  aprobada:      'Aprobada',
  auto_aprobada: 'Publicación automática',
  rechazada:     'Rechazada',
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
  const { esReclutador, esAdminEmpresa } = useEmpresa();
  const { usuario } = useAuth();
  const { toast, showToast } = useToast();

  // RBAC-01: admin_empresa puede pausar/cerrar/reactivar CUALQUIER oferta de
  // su empresa (control institucional). El reclutador solo puede hacerlo con
  // su propia oferta (o una histórica sin responsable registrado) — el
  // backend ya lo exige, esto solo evita mostrarle un botón que va a fallar.
  const puedeGestionarEstado = (oferta) =>
    esAdminEmpresa || !oferta.creadaPorUsuarioId || oferta.creadaPorUsuarioId === usuario?.id;

  // RBAC-02: a diferencia de puedeGestionarEstado, acá NO hay override de
  // admin_empresa — el contenido de una oferta solo lo edita el reclutador
  // responsable (o cualquier reclutador si es una oferta histórica sin
  // responsable registrado). admin_empresa nunca edita contenido.
  const puedeEditarContenido = (oferta) =>
    esReclutador && (!oferta.creadaPorUsuarioId || oferta.creadaPorUsuarioId === usuario?.id);

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

  const cards = esReclutador
    ? ORDEN_RECLUTADOR.map((k) => METRIC_CARDS.find((c) => c.key === k))
    : METRIC_CARDS;

  /* Cambia estado de una oferta (pausar / activar / cerrar) */
  const handleCambiarEstado = async (id, estado) => {
    setGuardando(id);
    try {
      await ofertaService.cambiarEstado(id, estado);
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

  /* ── Helpers de presentación, compartidos entre la tabla (desktop) y las ──
     cards (tablet/mobile) — misma fuente de datos y callbacks, sin duplicar
     la lógica de permisos/transición de estado. */
  const detalleOferta = (o) => [o.area, o.modalidad, o.ciudad].filter(Boolean).join(' · ');

  const renderEstadoBadge = (o) => (
    <span className="badge" style={{ background: ESTADO_COLOR[o.estado] ?? '#7f8c8d' }}>
      {ESTADO_LABEL[o.estado] ?? o.estado}
    </span>
  );

  // Moderación es un eje independiente del ciclo de vida (RBAC-04) — no se
  // muestra nada para 'aprobada' (es el estado esperado/silencioso), igual
  // criterio que antes tenía `!moderada`, pero ahora también distingue
  // 'rechazada' y 'auto_aprobada' en vez de colapsarlos en un booleano.
  const renderModeracionBadge = (o) => {
    if (o.estadoModeracion === 'aprobada') return null;
    const icono = o.estadoModeracion === 'pendiente' ? '⏳' : o.estadoModeracion === 'rechazada' ? '❌' : '🤖';
    return (
      <span
        className={styles.pendienteMod}
        style={{ color: MODERACION_COLOR[o.estadoModeracion] ?? undefined }}
        title={`Moderación: ${MODERACION_LABEL[o.estadoModeracion] ?? o.estadoModeracion}`}
      >
        · {icono} {MODERACION_LABEL[o.estadoModeracion] ?? o.estadoModeracion}
      </span>
    );
  };

  const renderCandidatosBtn = (o) => (
    <Link to={`/empresa/postulantes/${o.id}`} className="btn-small" aria-label={`Ver candidatos de "${o.titulo}"`}>
      Ver candidatos
    </Link>
  );

  const renderAcciones = (o) => {
    const editarBtn = puedeEditarContenido(o) && (
      <Link to={`/empresa/ofertas/${o.id}/editar`} className="btn-small" aria-label={`Editar la oferta "${o.titulo}"`}>
        ✏️ Editar
      </Link>
    );

    if (guardando === o.id) {
      return <>{editarBtn}<span className={styles.guardandoSpan}>Guardando...</span></>;
    }
    if (!puedeGestionarEstado(o)) {
      return (
        <>
          {editarBtn}
          <span className={styles.estadoNota} title="Solo el reclutador responsable puede modificar el estado de esta oferta.">
            Solo el responsable
          </span>
        </>
      );
    }
    if (o.estado === 'activa') {
      return (
        <>
          {editarBtn}
          <button className="btn-warn" onClick={() => handleCambiarEstado(o.id, 'pausada')} aria-label={`Pausar la oferta "${o.titulo}"`}>
            Pausar
          </button>
          <button className="btn-danger" onClick={() => handleCambiarEstado(o.id, 'cerrada')} aria-label={`Cerrar la oferta "${o.titulo}"`}>
            Cerrar
          </button>
        </>
      );
    }
    if (o.estado === 'pausada') {
      return (
        <>
          {editarBtn}
          <button className="btn-ok" onClick={() => handleCambiarEstado(o.id, 'activa')} aria-label={`Activar la oferta "${o.titulo}"`}>
            Activar
          </button>
        </>
      );
    }
    // cerrada
    return <>{editarBtn}<span className={styles.estadoNota}>—</span></>;
  };

  return (
    <div className="page-container">
      <Toast toast={toast} />

      {/* ── Cabecera ─────────────────────────────────────────────────────── */}
      <div className="dashboard-header">
        <h1>{esReclutador ? 'Panel de Reclutamiento' : 'Panel de Empresa'}</h1>
        <div className={styles.headerActions}>
          <Link to="/empresa/mi-empresa" className="btn-secondary">
            {esReclutador ? '🏢 Ver empresa' : '🏢 Editar empresa'}
          </Link>
          <Link to="/empresa/seguridad"  className="btn-secondary">🔐 Seguridad</Link>
          <Link to="/empresa/equipo"     className="btn-secondary">
            {esReclutador ? '👥 Ver equipo' : '👥 Gestionar equipo'}
          </Link>
          {!esAdminEmpresa && (
            <Link to="/empresa/nueva-oferta" className="btn-primary">+ Nueva Oferta</Link>
          )}
        </div>
      </div>


      {/* Error global */}
      {error && <p className={`error-msg ${styles.errorGlobal}`}>⚠️ {error}</p>}

      {/* ── Tarjetas de métricas ──────────────────────────────────────────── */}
      {loading ? (
        <div className={styles.skeletonGrid}>
          {cards.map((c) => <div key={c.key} className={styles.skeletonCard} />)}
        </div>
      ) : (
        <div className={styles.metricsGrid}>
          {cards.map(({ key, label, icon, color, action }) => (
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
          {!esAdminEmpresa && (
            <Link to="/empresa/nueva-oferta" className="btn-primary">Publicar primera oferta</Link>
          )}
        </div>
      ) : (
        <>
          {/* Desktop (≥1024px) — tabla semántica de 6 columnas, sin scroll horizontal */}
          <div className={styles.ofertasTablaWrap}>
            <table className={`tabla ${styles.ofertasTabla}`}>
              <thead>
                <tr>
                  <th className={styles.colOferta}>Oferta</th>
                  <th className={styles.colResponsable}>Responsable</th>
                  <th className={styles.colEstado}>Estado</th>
                  <th className={styles.colVacPost}>Vacantes / Postulados</th>
                  <th className={styles.colCandidatos}>Candidatos</th>
                  <th className={styles.colAcciones}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ofertas.map((o) => (
                  <tr key={o.id} className={guardando === o.id ? styles.rowGuardando : ''}>
                    <td className="cell-break">
                      <strong>{o.titulo}</strong>
                      {renderModeracionBadge(o)}
                      {detalleOferta(o) && <small className={styles.modalidadSmall}>{detalleOferta(o)}</small>}
                    </td>
                    <td className="cell-break">
                      {o.creadaPor
                        ? `${o.creadaPor.nombre} ${o.creadaPor.apellido}`
                        : <span className={styles.modalidadSmall}>Responsable no registrado</span>}
                    </td>
                    <td>{renderEstadoBadge(o)}</td>
                    <td className={styles.centrado}>
                      <span className={styles.vacPost}>
                        {o.cantidadVacantes ?? '—'}
                        <span className={styles.vacPostSep}>/</span>
                        <strong className={`${styles.postuladosCount} ${o.totalPostulaciones > 0 ? styles.tienen : ''}`}>
                          {o.totalPostulaciones ?? 0}
                        </strong>
                      </span>
                    </td>
                    <td>{renderCandidatosBtn(o)}</td>
                    <td className={styles.accionesTd}>{renderAcciones(o)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tablet/mobile (<1024px) — cards, sin intentar sostener 6 columnas angostas */}
          <div className={styles.ofertasCards}>
            {ofertas.map((o) => (
              <article
                key={o.id}
                className={`${styles.ofertaCard} ${guardando === o.id ? styles.rowGuardando : ''}`}
                style={{ '--card-color': ESTADO_COLOR[o.estado] ?? '#7f8c8d' }}
              >
                <header className={styles.cardHeader}>
                  <h3 className={styles.cardTitulo}>{o.titulo}</h3>
                  {renderModeracionBadge(o)}
                </header>
                {detalleOferta(o) && <p className={styles.cardMeta}>{detalleOferta(o)}</p>}

                <dl className={styles.cardFields}>
                  <div className={styles.cardField}>
                    <dt>Responsable</dt>
                    <dd>{o.creadaPor ? `${o.creadaPor.nombre} ${o.creadaPor.apellido}` : 'Responsable no registrado'}</dd>
                  </div>
                  <div className={styles.cardField}>
                    <dt>Estado</dt>
                    <dd>{renderEstadoBadge(o)}</dd>
                  </div>
                </dl>

                <p className={styles.cardStats}>
                  {o.cantidadVacantes ?? '—'} vacante{o.cantidadVacantes === 1 ? '' : 's'}
                  {' · '}
                  {o.totalPostulaciones ?? 0} postulado{o.totalPostulaciones === 1 ? '' : 's'}
                </p>

                <div className={styles.cardCandidatos}>{renderCandidatosBtn(o)}</div>
                <div className={styles.cardAcciones}>{renderAcciones(o)}</div>
              </article>
            ))}
          </div>

          <Paginacion
            pagination={paginationOfertas}
            onPageChange={(p) => cargarOfertas(filtroOferta, p)}
          />
        </>
      )}
    </div>
  );
}
