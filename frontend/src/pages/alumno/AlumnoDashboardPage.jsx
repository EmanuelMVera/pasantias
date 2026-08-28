/**
 * AlumnoDashboardPage.jsx — Panel principal del alumno/egresado.
 *
 * Consume GET /api/students/dashboard para mostrar:
 * - Métricas de postulaciones (total, en revisión, entrevistas, contrataciones)
 * - Porcentaje de perfil completado
 * - Notificaciones recientes no leídas
 * - Ofertas recomendadas (GET /api/ofertas/recomendadas)
 *
 * Ruta: /dashboard
 * Roles: alumno, egresado
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ofertaService, studentService } from '../../services/api';
import styles from './AlumnoDashboardPage.module.css';

// ── Tarjeta de métrica ────────────────────────────────────────────────────────
function MetricCard({ icon, label, value, color, to }) {
  const content = (
    <div className={styles.metricCard} style={{ borderTopColor: color }}>
      <span className={styles.metricIcon}>{icon}</span>
      <span className={styles.metricValue} style={{ color }}>{value ?? '—'}</span>
      <span className={styles.metricLabel}>{label}</span>
    </div>
  );
  return to ? <Link to={to} className={styles.metricLink}>{content}</Link> : content;
}

// ── Barra de progreso de perfil ───────────────────────────────────────────────
function PerfilProgress({ pct }) {
  const color = pct < 40 ? '#ef4444' : pct < 75 ? '#f59e0b' : '#10b981';
  return (
    <div className={styles.perfilProgress}>
      <div className={styles.perfilProgressHeader}>
        <span>Perfil completado</span>
        <span style={{ color, fontWeight: 700 }}>{pct}%</span>
      </div>
      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {pct < 80 && (
        <Link to="/perfil" className={styles.perfilCTA}>
          ✏️ Completar perfil para mejorar recomendaciones →
        </Link>
      )}
    </div>
  );
}

// ── Tarjeta de oferta recomendada ─────────────────────────────────────────────
function OfertaRecomendadaCard({ oferta }) {
  return (
    <div className={styles.recCard}>
      <div className={styles.recCardBody}>
        <h4 className={styles.recTitle}>{oferta.titulo}</h4>
        <p className={styles.recEmpresa}>{oferta.empresa?.razonSocial}</p>
        <div className={styles.recMeta}>
          <span>📍 {oferta.ciudad}</span>
          <span>💼 {oferta.modalidad}</span>
          {oferta.remuneracion && <span>💰 {oferta.remuneracion}</span>}
        </div>
        {oferta.matchScore != null && (
          <div className={styles.matchBadge}>
            ⭐ {oferta.matchScore}% de compatibilidad
          </div>
        )}
      </div>
      <Link to={`/ofertas/${oferta.id}`} className="btn-small">
        Ver →
      </Link>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function AlumnoDashboardPage() {
  const { usuario } = useAuth();

  const [stats, setStats]           = useState(null);
  const [recomendadas, setRecomendadas] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingRec, setLoadingRec]   = useState(true);
  const [errorStats, setErrorStats]   = useState(false);

  // Carga métricas del dashboard
  useEffect(() => {
    studentService.getDashboard()
      .then(({ data }) => setStats(data.data ?? data))
      .catch(() => setErrorStats(true))
      .finally(() => setLoadingStats(false));
  }, []);

  // Carga ofertas recomendadas
  useEffect(() => {
    ofertaService.getRecomendadas()
      .then(({ data }) => setRecomendadas(data.data ?? []))
      .catch(() => setRecomendadas([]))
      .finally(() => setLoadingRec(false));
  }, []);

  // Métricas con fallback si el endpoint no existe aún
  const metricas = {
    total:        stats?.totalPostulaciones ?? stats?.total ?? 0,
    enRevision:   stats?.enRevision   ?? 0,
    entrevistas:  stats?.entrevistas  ?? 0,
    contratados:  stats?.contrataciones  ?? 0,
    perfilPct:    stats?.perfilCompleto ?? stats?.perfilCompletado ?? stats?.perfilPct ?? 0,
    notifs:       stats?.notificacionesNoLeidas ?? stats?.notificacionesSinLeer ?? 0,
  };


  return (
    <div className="page-container">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.greeting}>
            ¡Hola, {usuario?.nombre}! 👋
          </h1>
          <p className={styles.subtitle}>
            {usuario?.rol === 'egresado' ? 'Egresado' : 'Alumno'} ·{' '}
            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link to="/ofertas" className="btn-primary">
            🔍 Ver ofertas
          </Link>
        </div>
      </div>

      {/* ── Métricas ───────────────────────────────────────────────────────── */}
      {loadingStats ? (
        <div className={styles.skeletonGrid}>
          {[1,2,3,4].map(i => <div key={i} className={styles.skeletonCard} />)}
        </div>
      ) : errorStats ? (
        <div className={styles.errorBanner}>
          ⚠️ No se pudieron cargar las estadísticas. El endpoint <code>/api/students/dashboard</code> puede no estar disponible aún.
        </div>
      ) : (
        <div className={styles.metricsGrid}>
          <MetricCard
            icon="📋" label="Postulaciones" value={metricas.total}
            color="var(--primary)" to="/mis-postulaciones"
          />
          <MetricCard
            icon="🔍" label="En revisión" value={metricas.enRevision}
            color="#f59e0b" to="/mis-postulaciones"
          />
          <MetricCard
            icon="🗓️" label="Entrevistas" value={metricas.entrevistas}
            color="#8b5cf6" to="/mis-postulaciones"
          />
          <MetricCard
            icon="🎉" label="Contrataciones" value={metricas.contratados}
            color="#10b981" to="/mis-postulaciones"
          />
        </div>
      )}

      {/* ── Progreso de perfil ─────────────────────────────────────────────── */}
      {!loadingStats && !errorStats && (
        <PerfilProgress pct={metricas.perfilPct} />
      )}

      {/* ── Notificaciones pendientes ──────────────────────────────────────── */}
      {metricas.notifs > 0 && (
        <div className={styles.notifBanner}>
          🔔 Tenés <strong>{metricas.notifs}</strong> notificacion{metricas.notifs !== 1 ? 'es' : ''} sin leer.
        </div>
      )}

      {/* ── Ofertas recomendadas ───────────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>⭐ Ofertas recomendadas para vos</h2>
          <Link to="/ofertas" className={styles.seeAllLink}>
            Ver todas las ofertas →
          </Link>
        </div>

        {loadingRec ? (
          <div className={styles.skeletonList}>
            {[1,2,3].map(i => <div key={i} className={styles.skeletonRec} />)}
          </div>
        ) : recomendadas.length === 0 ? (
          <div className={styles.emptyRec}>
            <span className={styles.emptyIcon}>🎯</span>
            <p>Completá tu perfil para recibir recomendaciones personalizadas.</p>
            <Link to="/perfil" className="btn-primary">Completar perfil</Link>
          </div>
        ) : (
          <div className={styles.recList}>
            {recomendadas.slice(0, 5).map((o) => (
              <OfertaRecomendadaCard key={o.id} oferta={o} />
            ))}
          </div>
        )}
      </section>

      {/* ── Accesos rápidos ────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>⚡ Accesos rápidos</h2>
        <div className={styles.quickGrid}>
          <Link to="/ofertas" className={styles.quickCard}>
            <span className={styles.quickIcon}>🏢</span>
            <span>Explorar Ofertas</span>
          </Link>
          <Link to="/mis-postulaciones" className={styles.quickCard}>
            <span className={styles.quickIcon}>📋</span>
            <span>Mis Postulaciones</span>
          </Link>
          <Link to="/perfil" className={styles.quickCard}>
            <span className={styles.quickIcon}>👤</span>
            <span>Editar Perfil</span>
          </Link>
          <Link to="/chat" className={styles.quickCard}>
            <span className={styles.quickIcon}>💬</span>
            <span>Mensajes</span>
          </Link>
        </div>
      </section>

    </div>
  );
}
