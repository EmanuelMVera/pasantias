/**
 * OfertasPage.jsx — Explorador de ofertas del alumno/egresado.
 *
 * Ruta: /ofertas (roles alumno, egresado)
 * - Pestaña "Todas": GET /api/ofertas con filtros (título, área, modalidad,
 *   tipo de puesto, ciudad), aplicados con "Buscar" — no en cada tecla.
 * - Pestaña "Recomendadas": GET /api/ofertas/recomendadas, lazy (solo al entrar),
 *   ordenadas por compatibilidad con el perfil.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ofertaService } from '../../services/oferta.service';
import Paginacion from '../../components/Paginacion/Paginacion';
import PageHeader from '../../components/ui/PageHeader';
import Tabs, { TabPanel } from '../../components/ui/Tabs';
import EmptyState from '../../components/ui/EmptyState';
import Icon from '../../components/ui/Icon';
import { MODALIDAD_LABEL, TIPO_PUESTO, formatFecha, modalidadLabel, puestoBadge } from '../../utils/ofertaPresentacion';
import styles from './OfertasPage.module.css';

const FILTROS_VACIOS = { q: '', area: '', modalidad: '', ciudad: '', tipoPuesto: '' };
const LIMITE = 12;

function OfertaCard({ oferta }) {
  const badge = puestoBadge(oferta);
  return (
    <article className={styles.card}>
      <div className={styles.cardBadges}>
        {badge && <span className={`badge badge-tone-${badge.tone}`}>{badge.label}</span>}
        {oferta.matchScore != null && (
          <span className={`badge badge-tone-blue ${styles.match}`}>{oferta.matchScore}% compatible</span>
        )}
      </div>
      <h3 className={styles.cardTitle}>{oferta.titulo}</h3>
      {oferta.empresa?.razonSocial && (
        <p className={styles.cardEmpresa}>
          {oferta.empresaId
            ? <Link to={`/empresa/${oferta.empresaId}`}>{oferta.empresa.razonSocial}</Link>
            : oferta.empresa.razonSocial}
        </p>
      )}
      <ul className={styles.cardMeta}>
        {oferta.ciudad && <li><Icon name="mapPin" size={14} /> {oferta.ciudad}</li>}
        {oferta.modalidad && <li><Icon name="briefcase" size={14} /> {modalidadLabel(oferta.modalidad)}</li>}
        {oferta.fechaLimite && <li><Icon name="clock" size={14} /> Cierra el {formatFecha(oferta.fechaLimite)}</li>}
      </ul>
      <Link to={`/ofertas/${oferta.id}`} className={`btn-secondary ${styles.cardCta}`} aria-label={`Ver detalle: ${oferta.titulo}`}>
        Ver detalle
      </Link>
    </article>
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

  // `filtrosArg` explícito para poder limpiar sin esperar al re-render del state.
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

  const cargarRecomendadas = useCallback(async (pagina = 1) => {
    setLoadingRec(true);
    try {
      const { data } = await ofertaService.getRecomendadas({ page: pagina, limit: LIMITE });
      setRecomendadas(data.data ?? []);
      setPagRec(data.pagination ?? null);
    } catch {
      setRecomendadas([]);
      setPagRec(null);
    } finally {
      setRecCargadas(true);
      setLoadingRec(false);
    }
  }, []);

  // Solo carga inicial: los cambios de filtro se aplican con el botón Buscar.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargarOfertas(1); }, []);

  const handleFiltro  = (e) => setFiltros({ ...filtros, [e.target.name]: e.target.value });
  const handleBuscar  = (e) => { e.preventDefault(); cargarOfertas(1); };
  const handleLimpiar = () => {
    setFiltros(FILTROS_VACIOS);
    cargarOfertas(1, FILTROS_VACIOS);
  };
  const hayFiltros = Object.values(filtros).some(Boolean);

  const cambiarModo = (m) => {
    setModo(m);
    if (m === 'recomendadas' && !recCargadas) cargarRecomendadas(1);
  };

  const esRec = modo === 'recomendadas';
  const lista = esRec ? recomendadas : ofertas;
  const cargando = esRec ? (loadingRec || !recCargadas) : loading;
  const pag = esRec ? pagRec : pagTodas;
  const total = pag?.total ?? lista.length;

  return (
    <div className="page-container">
      <PageHeader
        title="Ofertas disponibles"
        subtitle="Pasantías y primeros empleos publicados por empresas aprobadas por el instituto."
      />

      <Tabs
        idPrefix="ofertas"
        ariaLabel="Ofertas"
        value={modo}
        onChange={cambiarModo}
        tabs={[
          { key: 'todas', label: 'Todas', icon: 'briefcase', count: !loading && pagTodas ? pagTodas.total : undefined },
          { key: 'recomendadas', label: 'Recomendadas para vos', icon: 'trophy', count: recCargadas && pagRec ? pagRec.total : undefined },
        ]}
      />

      <TabPanel idPrefix="ofertas" tabKey={modo}>
        {!esRec && (
          <form onSubmit={handleBuscar} className={`filtros-form ${styles.filtros}`} role="search" aria-label="Filtrar ofertas">
            <input name="q" placeholder="Buscar por título" aria-label="Buscar por título" value={filtros.q} onChange={handleFiltro} />
            <input name="area" placeholder="Área" aria-label="Área" value={filtros.area} onChange={handleFiltro} />
            <select name="modalidad" aria-label="Modalidad" value={filtros.modalidad} onChange={handleFiltro}>
              <option value="">Toda modalidad</option>
              {Object.entries(MODALIDAD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select name="tipoPuesto" aria-label="Tipo de puesto" value={filtros.tipoPuesto} onChange={handleFiltro}>
              <option value="">Todo tipo de puesto</option>
              {Object.entries(TIPO_PUESTO).map(([v, t]) => <option key={v} value={v}>{t.label}</option>)}
            </select>
            <input name="ciudad" placeholder="Ciudad" aria-label="Ciudad" value={filtros.ciudad} onChange={handleFiltro} />
            <button type="submit" className="btn-primary">Buscar</button>
            {hayFiltros && (
              <button type="button" className="btn-secondary" onClick={handleLimpiar}>Limpiar</button>
            )}
          </form>
        )}

        {esRec && recCargadas && lista.length > 0 && (
          <p className={styles.recInfo}>
            Ordenadas por compatibilidad con tu perfil.{' '}
            <Link to="/perfil">Completá tu perfil</Link> para mejorar los resultados.
          </p>
        )}

        {cargando ? (
          <div className={styles.skeletonGrid} aria-hidden="true">
            {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className={styles.skeletonCard} />)}
          </div>
        ) : lista.length === 0 ? (
          esRec ? (
            <EmptyState
              iconName="user"
              title="Todavía no tenemos recomendaciones para vos."
              hint="Cargá tu área de interés, habilidades y ubicación en el perfil."
            >
              <Link to="/perfil" className="btn-primary">Completar perfil</Link>
            </EmptyState>
          ) : (
            <EmptyState
              iconName="search"
              title={hayFiltros ? 'No hay ofertas con esos filtros.' : 'No hay ofertas publicadas por ahora.'}
              hint={hayFiltros ? 'Probá con otros filtros.' : 'Volvé a revisar en unos días.'}
            >
              {hayFiltros && <button type="button" className="btn-secondary" onClick={handleLimpiar}>Ver todas las ofertas</button>}
            </EmptyState>
          )
        ) : (
          <>
            <p className={styles.resultCount}>
              {total} oferta{total !== 1 ? 's' : ''}{esRec ? ' recomendada' : ' encontrada'}{total !== 1 ? 's' : ''}
            </p>
            <div className="ofertas-grid">
              {lista.map((oferta) => <OfertaCard key={oferta.id} oferta={oferta} />)}
            </div>
            <Paginacion pagination={pag} onPageChange={esRec ? cargarRecomendadas : cargarOfertas} />
          </>
        )}
      </TabPanel>
    </div>
  );
}
