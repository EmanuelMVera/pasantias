/**
 * NotificacionesPage.jsx — Centro de notificaciones del usuario.
 *
 * Ruta: /notificaciones (accesible para todos los roles autenticados)
 *
 * Funcionalidades:
 * - Lista todas las notificaciones (no leídas primero, ordenadas por fecha)
 * - Filtro por tipo (todas / no leídas / leídas)
 * - Marcar una notificación como leída (clic en card)
 * - Marcar todas como leídas
 * - Eliminar notificaciones individualmente
 * - Eliminar todas las notificaciones YA LEÍDAS (con confirmación; las
 *   pendientes nunca se borran en bloque)
 * - Navegar a la acción asociada (accionURL o enlace)
 * - Indicadores visuales de prioridad y tipo
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificacionService } from '../services/notificacion.service';
import Paginacion from '../components/Paginacion/Paginacion';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import Icon from '../components/ui/Icon';
import ConfirmModal from '../components/ui/ConfirmModal';
import { usePaginacion } from '../hooks/usePaginacion';
import styles from './NotificacionesPage.module.css';

// Cada tab de filtro → valor del query param `leida` del backend
const FILTRO_A_LEIDA = { todas: undefined, 'no-leidas': 'false', leidas: 'true' };

/* ── Configuración visual por tipo (ícono de ui/Icon + color de acento) ───── */
const TIPO_CONFIG = {
  postulacion: { icon: 'send',      label: 'Postulación',  color: '#0073AD' },
  estado:      { icon: 'refresh',   label: 'Estado',       color: '#6d44a8' },
  oferta:      { icon: 'briefcase', label: 'Oferta',       color: '#1f8a4c' },
  chat:        { icon: 'message',   label: 'Mensaje',      color: '#127a6c' },
  sistema:     { icon: 'settings',  label: 'Sistema',      color: '#4d5b6a' },
};

const VISUAL_CONFIG = {
  info:    { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  success: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
  warning: { bg: '#fffbeb', border: '#fed7aa', text: '#92400e' },
  error:   { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
};

const FILTROS = [
  { key: 'todas', label: 'Todas' },
  { key: 'no-leidas', label: 'Sin leer' },
  { key: 'leidas', label: 'Leídas' },
];

/* ── Formatea fecha relativa ────────────────────────────────────────────────── */
function formatearFecha(fecha) {
  const d = new Date(fecha);
  const ahora = new Date();
  const diffMs = ahora - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH   = Math.floor(diffMs / 3600000);
  const diffD   = Math.floor(diffMs / 86400000);

  if (diffMin < 1)  return 'Ahora mismo';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  if (diffH   < 24) return `Hace ${diffH}h`;
  if (diffD   < 7)  return `Hace ${diffD} día${diffD !== 1 ? 's' : ''}`;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ── Card individual ────────────────────────────────────────────────────────── */
function NotifCard({ notif, onLeer, onEliminar }) {
  const navigate = useNavigate();
  const tipo     = TIPO_CONFIG[notif.tipo]   ?? TIPO_CONFIG.sistema;
  const visual   = VISUAL_CONFIG[notif.tipoVisual] ?? VISUAL_CONFIG.info;

  const handleClick = async () => {
    if (!notif.leida) await onLeer(notif.id);
    // Solo rutas internas relativas: nunca una URL absoluta ni un path externo
    // (evita navegar fuera de la SPA o caer al fallback → home).
    const url = notif.accionURL || notif.enlace;
    if (url && url.startsWith('/') && !url.startsWith('//')) navigate(url);
  };

  return (
    <div
      className={`${styles.notifCard} ${!notif.leida ? styles.noLeida : ''}`}
      style={!notif.leida ? { background: visual.bg } : undefined}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`${notif.titulo}${notif.leida ? '' : ' (sin leer)'}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); }
      }}
    >
      {/* Ícono del tipo */}
      <div className={styles.notifIcon} style={{ background: `${tipo.color}14`, color: tipo.color }} aria-hidden="true">
        <Icon name={tipo.icon} size={20} />
      </div>

      {/* Contenido */}
      <div className={styles.notifContent}>
        <div className={styles.notifTopRow}>
          <span className={styles.notifTipo} style={{ color: tipo.color }}>
            {tipo.label}
          </span>
          {notif.prioridad === 'alta' || notif.prioridad === 'urgente' ? (
            <span className={styles.notifUrgente}>
              <Icon name="alert" size={13} strokeWidth={2.2} /> Urgente
            </span>
          ) : null}
          <span className={styles.notifFecha}>{formatearFecha(notif.createdAt)}</span>
        </div>

        <strong className={styles.notifTitulo}>{notif.titulo}</strong>
        <p className={styles.notifMensaje}>{notif.mensaje}</p>

        {(notif.accionURL || notif.enlace) && (
          <span className={styles.notifAccion}>Ver más <Icon name="arrowRight" size={14} /></span>
        )}
      </div>

      {/* Acciones */}
      <div className={styles.notifAcciones} onClick={(e) => e.stopPropagation()}>
        {!notif.leida && (
          <button
            className={styles.btnLeer}
            title="Marcar como leída"
            aria-label="Marcar como leída"
            onClick={() => onLeer(notif.id)}
          >
            <Icon name="check" size={16} strokeWidth={2.2} />
          </button>
        )}
        <button
          className={styles.btnEliminar}
          title="Eliminar notificación"
          aria-label="Eliminar notificación"
          onClick={() => onEliminar(notif.id)}
        >
          <Icon name="trash" size={16} />
        </button>
      </div>

      {/* Punto indicador de no leída */}
      {!notif.leida && <span className={styles.puntoBadge} />}
    </div>
  );
}

/* ── Página principal ───────────────────────────────────────────────────────── */
export default function NotificacionesPage() {
  const [notifs,   setNotifs]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filtro,   setFiltro]   = useState('todas');
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');
  const [pagination, setPagination] = useState(null);
  const [noLeidasCount, setNoLeidasCount] = useState(0);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const { page, setPage } = usePaginacion([filtro]);

  const refrescarSinLeer = useCallback(() => {
    notificacionService.sinLeerCount()
      .then(({ data }) => setNoLeidasCount(data.count ?? 0))
      .catch(() => {});
  }, []);

  /* Carga (paginada, filtro server-side por `leida`) */
  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 20 };
      const leida = FILTRO_A_LEIDA[filtro];
      if (leida !== undefined) params.leida = leida;
      const { data } = await notificacionService.getAll(params);
      setNotifs(data.data ?? []);
      setPagination(data.pagination ?? null);
      if (typeof data.sinLeer === 'number') setNoLeidasCount(data.sinLeer);
    } catch {
      setError('No se pudieron cargar las notificaciones.');
    } finally {
      setLoading(false);
    }
  }, [page, filtro]);

  useEffect(() => { cargar(); }, [cargar]);

  /* Marcar como leída (optimista) */
  const handleLeer = async (id) => {
    setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, leida: true } : n));
    setNoLeidasCount((c) => Math.max(0, c - 1));
    try {
      await notificacionService.leer(id);
    } catch {
      setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, leida: false } : n));
      refrescarSinLeer();
    }
  };

  /* Marcar todas como leídas */
  const handleLeerTodas = async () => {
    try {
      await notificacionService.leerTodas();
      setSuccess('Todas marcadas como leídas.');
      setTimeout(() => setSuccess(''), 2500);
      setNoLeidasCount(0);
      cargar();
    } catch {
      cargar();
    }
  };

  /* Eliminar (optimista) */
  const handleEliminar = async (id) => {
    const eliminada = notifs.find((n) => n.id === id);
    setNotifs((prev) => prev.filter((n) => n.id !== id));
    if (eliminada && !eliminada.leida) setNoLeidasCount((c) => Math.max(0, c - 1));
    try {
      await notificacionService.eliminar(id);
      setPagination((p) => (p ? { ...p, total: Math.max(0, p.total - 1) } : p));
    } catch {
      cargar();
    }
  };

  /* Eliminar leídas (con confirmación). Cuántas hay se deduce de datos reales:
     en "Leídas" es el total del filtro; en "Todas", total − sin leer. */
  const leidasCount = loading || !pagination ? 0
    : filtro === 'leidas' ? pagination.total
    : filtro === 'todas' ? Math.max(0, pagination.total - noLeidasCount)
    : 0;

  const handleEliminarLeidas = async () => {
    setBorrando(true);
    try {
      const { data } = await notificacionService.eliminarLeidas();
      const n = data.eliminadas ?? 0;
      setConfirmarBorrado(false);
      setSuccess(`Se eliminaron ${n} notificaci${n !== 1 ? 'ones' : 'ón'} leída${n !== 1 ? 's' : ''}.`);
      setTimeout(() => setSuccess(''), 3000);
      // noLeidasCount no cambia: solo se borraron leídas.
      if (page !== 1) setPage(1);
      else await cargar();
    } catch {
      setConfirmarBorrado(false);
      setError('No se pudieron eliminar las notificaciones leídas.');
    } finally {
      setBorrando(false);
    }
  };

  const notifsFiltradas = notifs;

  return (
    <div className="page-container">

      {/* ── Cabecera ────────────────────────────────────────────────────── */}
      <PageHeader
        title="Notificaciones"
        subtitle={noLeidasCount > 0
          ? `Tenés ${noLeidasCount} notificación${noLeidasCount !== 1 ? 'es' : ''} sin leer`
          : 'Todas las notificaciones al día.'}
        actions={noLeidasCount > 0 && (
          <button type="button" className="btn-secondary" onClick={handleLeerTodas}>
            <Icon name="checkCircle" size={18} />
            Marcar todas como leídas
          </button>
        )}
      />

      {/* Mensajes */}
      {error   && <p className={`error-msg ${styles.mensaje}`} role="alert">{error}</p>}
      {success && <div className={styles.successBanner} role="status">{success}</div>}

      {/* ── Filtro (control segmentado) ─────────────────────────────────────
          Solo "Sin leer" lleva contador (y solo si hay): es el único conteo que
          el backend informa siempre. El total del filtro activo va debajo. */}
      <div className={styles.filtroBar}>
        <div className={styles.filtroTabs} role="group" aria-label="Filtrar notificaciones">
          {FILTROS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`${styles.filtroTab} ${filtro === key ? styles.filtroActivo : ''}`}
              aria-pressed={filtro === key}
              onClick={() => setFiltro(key)}
            >
              {label}
              {key === 'no-leidas' && noLeidasCount > 0 && (
                <span className={styles.filtroCount}>{noLeidasCount}</span>
              )}
            </button>
          ))}
        </div>
        <div className={styles.filtroAcciones}>
          {!loading && pagination && (
            <p className={styles.resultados} role="status" aria-live="polite">
              {pagination.total} notificaci{pagination.total !== 1 ? 'ones' : 'ón'}
            </p>
          )}
          {leidasCount > 0 && (
            <button type="button" className="btn-secondary" onClick={() => setConfirmarBorrado(true)}>
              <Icon name="trash" size={17} />
              Eliminar leídas
            </button>
          )}
        </div>
      </div>

      {/* ── Lista ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className={styles.skeletonList}>
          {[1, 2, 3, 4].map((i) => <div key={i} className={styles.skeletonItem} />)}
        </div>
      ) : notifsFiltradas.length === 0 ? (
        <EmptyState
          className={styles.emptyState}
          iconName={filtro === 'no-leidas' ? 'checkCircle' : 'bell'}
          title={filtro === 'no-leidas'
            ? '¡Sin notificaciones pendientes! Estás al día.'
            : filtro === 'leidas'
            ? 'No hay notificaciones leídas todavía.'
            : 'Todavía no tenés ninguna notificación.'}
        />
      ) : (
        <>
          <div className={styles.notifList}>
            {notifsFiltradas.map((n) => (
              <NotifCard
                key={n.id}
                notif={n}
                onLeer={handleLeer}
                onEliminar={handleEliminar}
              />
            ))}
          </div>
          <Paginacion pagination={pagination} onPageChange={setPage} />
        </>
      )}

      {confirmarBorrado && (
        <ConfirmModal
          title="Eliminar notificaciones leídas"
          confirmLabel="Eliminar leídas"
          tone="danger"
          busy={borrando}
          onConfirm={handleEliminarLeidas}
          onClose={() => setConfirmarBorrado(false)}
          confirmId="btn-confirmar-eliminar-leidas"
        >
          <p>
            Se eliminarán <strong>{leidasCount}</strong> notificaci{leidasCount !== 1 ? 'ones' : 'ón'} ya
            leída{leidasCount !== 1 ? 's' : ''}. Las notificaciones pendientes se conservarán.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
