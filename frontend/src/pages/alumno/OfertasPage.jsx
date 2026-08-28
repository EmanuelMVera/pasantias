/**
 * OfertasPage.jsx — Explorador de ofertas disponibles para el alumno/egresado.
 *
 * Funcionalidades:
 * - Búsqueda y filtros (título, área, modalidad, ciudad)
 * - Grid de tarjetas de ofertas
 * - Tab "Ver recomendadas" que consume GET /api/ofertas/recomendadas
 *
 * Ruta: /ofertas
 * Roles: alumno, egresado
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ofertaService } from '../../services/api';
import Paginacion from '../../components/Paginacion/Paginacion';
import styles from './OfertasPage.module.css';

const FILTROS_VACIOS = { q: '', area: '', modalidad: '', ciudad: '', tipoPuesto: '' };
const LIMITE = 12;

const TIPO_PUESTO_LABEL = { pasante: '🎓 Pasante', trainee: '🌱 Trainee', junior: '💼 Junior' };

// Tarjeta individual de oferta
function OfertaCard({ oferta }) {
  // Muestra tipoPuesto si existe (oferta nueva), si no fallback a nivelExperiencia legacy
  const puestoBadge = oferta.tipoPuesto
    ? TIPO_PUESTO_LABEL[oferta.tipoPuesto] ?? oferta.tipoPuesto
    : oferta.nivelExperiencia?.replace(/_/g, ' ');

  return (
    <div className={styles.card}>
      {oferta.matchScore != null && (
        <span className={styles.matchPill}>⭐ {oferta.matchScore}% match</span>
      )}
      <h3 className={styles.cardTitle}>{oferta.titulo}</h3>
      <p className={styles.cardEmpresa}>
        {oferta.empresaId ? (
          <Link
            to={`/empresa/${oferta.empresaId}`}
            style={{ color: 'inherit', textDecoration: 'none' }}
            onClick={(e) => e.stopPropagation()}
          >
            {oferta.empresa?.razonSocial}
          </Link>
        ) : (
          oferta.empresa?.razonSocial
        )}
      </p>
      <div className={styles.cardMeta}>
        {oferta.ciudad     && <span>📍 {oferta.ciudad}</span>}
        {oferta.modalidad  && <span>💼 {oferta.modalidad}</span>}
        {oferta.remuneracion && <span>💰 {oferta.remuneracion}</span>}
      </div>
      {puestoBadge && (
        <span className={`badge badge-puesto badge-${oferta.tipoPuesto ?? 'legacy'}`}>
          {puestoBadge}
        </span>
      )}
      {oferta.fechaLimite && (
        <p className={styles.fechaLimite}>
          📅 Cierre: {new Date(oferta.fechaLimite).toLocaleDateString('es-AR')}
        </p>
      )}
      <Link to={`/ofertas/${oferta.id}`} className="btn-secondary" style={{ marginTop: 'auto' }}>
        Ver detalle →
      </Link>
    </div>
  );
}

export default function OfertasPage() {
  const [modo, setModo]             = useState('todas');    // 'todas' | 'recomendadas'
  const [ofertas, setOfertas]       = useState([]);
  const [recomendadas, setRecomendadas] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [loadingRec, setLoadingRec] = useState(false);
  const [recCargadas, setRecCargadas] = useState(false);
  const [filtros, setFiltros]       = useState(FILTROS_VACIOS);
  const [pagTodas, setPagTodas]     = useState(null);
  const [pagRec, setPagRec]         = useState(null);

  // Carga todas las ofertas (con filtros). `filtrosArg` explícito para poder
  // limpiar sin esperar al re-render del state.
  const cargarOfertas = useCallback(async (pagina = 1, filtrosArg = filtros) => {
    setLoading(true);
    try {
      const { data } = await ofertaService.getAll({ ...filtrosArg, page: pagina, limit: LIMITE });
      setOfertas(data.data ?? []);
      setPagTodas(data.pagination ?? null);
    } catch {
      setOfertas([]);
      setPagTodas(null);
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  // Carga ofertas recomendadas (lazy: solo al entrar a la tab)
  const cargarRecomendadas = useCallback(async (pagina = 1) => {
    setLoadingRec(true);
    try {
      const { data } = await ofertaService.getRecomendadas({ page: pagina, limit: LIMITE });
      setRecomendadas(data.data ?? []);
      setPagRec(data.pagination ?? null);
      setRecCargadas(true);
    } catch {
      setRecomendadas([]);
      setPagRec(null);
      setRecCargadas(true);
    } finally {
      setLoadingRec(false);
    }
  }, []);

  useEffect(() => { cargarOfertas(1); }, []);

  const handleFiltro  = (e) => setFiltros({ ...filtros, [e.target.name]: e.target.value });
  const handleBuscar  = (e) => { e.preventDefault(); cargarOfertas(1); };
  const handleLimpiar = () => {
    setFiltros(FILTROS_VACIOS);
    cargarOfertas(1, FILTROS_VACIOS);
  };

  const handleTabRecomendadas = () => {
    setModo('recomendadas');
    if (!recCargadas) cargarRecomendadas(1);
  };

  const listaActual = modo === 'recomendadas' ? recomendadas : ofertas;
  const cargandoActual = modo === 'recomendadas' ? loadingRec : loading;
  const pagActual = modo === 'recomendadas' ? pagRec : pagTodas;
  const onPageActual = modo === 'recomendadas' ? cargarRecomendadas : cargarOfertas;

  return (
    <div className="page-container">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="dashboard-header">
        <h1>Ofertas Disponibles</h1>
        <Link to="/dashboard" className="btn-secondary">← Dashboard</Link>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${modo === 'todas' ? styles.tabActive : ''}`}
          onClick={() => setModo('todas')}
        >
          🏢 Todas las ofertas
          {!loading && pagTodas && <span className={styles.tabCount}>{pagTodas.total}</span>}
        </button>
        <button
          className={`${styles.tab} ${modo === 'recomendadas' ? styles.tabActive : ''}`}
          onClick={handleTabRecomendadas}
        >
          ⭐ Recomendadas para vos
          {recCargadas && pagRec && <span className={styles.tabCount}>{pagRec.total}</span>}
        </button>
      </div>

      {/* ── Filtros (solo en modo "todas") ─────────────────────────────── */}
      {modo === 'todas' && (
        <form onSubmit={handleBuscar} className="filtros-form">
          <input
            name="q"
            placeholder="🔍 Buscar por título..."
            value={filtros.q}
            onChange={handleFiltro}
          />
          <input
            name="area"
            placeholder="Área"
            value={filtros.area}
            onChange={handleFiltro}
          />
          <select name="modalidad" value={filtros.modalidad} onChange={handleFiltro}>
            <option value="">Toda modalidad</option>
            <option value="presencial">Presencial</option>
            <option value="remoto">Remoto</option>
            <option value="hibrido">Híbrido</option>
          </select>
          <select name="tipoPuesto" value={filtros.tipoPuesto} onChange={handleFiltro}>
            <option value="">Tipo de puesto</option>
            <option value="pasante">🎓 Pasante</option>
            <option value="trainee">🌱 Trainee</option>
            <option value="junior">💼 Junior</option>
          </select>
          <input
            name="ciudad"
            placeholder="Ciudad"
            value={filtros.ciudad}
            onChange={handleFiltro}
          />
          <button type="submit" className="btn-primary">Buscar</button>
          {(filtros.q || filtros.area || filtros.modalidad || filtros.ciudad || filtros.tipoPuesto) && (
            <button type="button" className="btn-secondary" onClick={handleLimpiar}>
              Limpiar
            </button>
          )}
        </form>
      )}

      {/* ── Aviso recomendadas ──────────────────────────────────────────── */}
      {modo === 'recomendadas' && recCargadas && (
        <div className={styles.recInfo}>
          ⭐ Las ofertas se ordenan por compatibilidad con tu perfil.
          ¿Pocas recomendaciones?{' '}
          <Link to="/perfil">Completá tu perfil</Link> para mejorar los resultados.
        </div>
      )}

      {/* ── Resultados ─────────────────────────────────────────────────── */}
      {cargandoActual ? (
        <div className={styles.skeletonGrid}>
          {[1,2,3,4,5,6].map(i => <div key={i} className={styles.skeletonCard} />)}
        </div>
      ) : listaActual.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>
            {modo === 'recomendadas' ? '🎯' : '🔍'}
          </span>
          <h3>
            {modo === 'recomendadas'
              ? 'Completá tu perfil para recibir recomendaciones'
              : 'No hay ofertas con esos filtros'}
          </h3>
          {modo === 'recomendadas' ? (
            <Link to="/perfil" className="btn-primary">Completar perfil</Link>
          ) : (
            <button className="btn-secondary" onClick={handleLimpiar}>
              Ver todas las ofertas
            </button>
          )}
        </div>
      ) : (
        <>
          <p className={styles.resultCount}>
            {(pagActual?.total ?? listaActual.length)} oferta{(pagActual?.total ?? listaActual.length) !== 1 ? 's' : ''}
            {modo === 'recomendadas' ? ' recomendadas' : ' encontradas'}
          </p>
          <div className="ofertas-grid">
            {listaActual.map((oferta) => (
              <OfertaCard key={oferta.id} oferta={oferta} />
            ))}
          </div>
          <Paginacion pagination={pagActual} onPageChange={onPageActual} />
        </>
      )}
    </div>
  );
}
