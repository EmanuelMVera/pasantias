/**
 * CandidatosEmpresaPage.jsx — Vista consolidada de candidatos de la empresa.
 *
 * Muestra todos los candidatos de todas las ofertas de la empresa.
 * Permite filtrar por estado desde las tabs.
 * Al hacer click en "Ver oferta" lleva a /empresa/postulantes/:ofertaId.
 *
 * Ruta: /empresa/candidatos?estado=X
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { empresaService } from '../../services/api';
import Avatar from '../../components/Avatar/Avatar';
import Paginacion from '../../components/Paginacion/Paginacion';
import TableResponsive from '../../components/ui/TableResponsive';
import EmptyState from '../../components/ui/EmptyState';
import { getEstadoInfo } from '../../constants/postulacionEstados';
import styles from './CandidatosEmpresaPage.module.css';

// Labels en plural para las tabs de filtro — los `value` son los estados
// canónicos de constants/postulacionEstados.js (fuente de color/label/emoji).
const ESTADOS_TABS = [
  { value: '',             label: 'Todos' },
  { value: 'en_revision',  label: 'En revisión' },
  { value: 'preseleccionado', label: 'Preseleccionados' },
  { value: 'entrevista',   label: 'Entrevista' },
  { value: 'contratado',   label: 'Contratados' },
  { value: 'rechazado',    label: 'No seleccionados' },
];

function formatFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function CandidatosEmpresaPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const estadoParam = searchParams.get('estado') ?? '';

  const [candidatos, setCandidatos] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [pagination, setPagination] = useState(null);
  const [conteoPorEstado, setConteoPorEstado] = useState({});

  const cargar = useCallback(async (estado, pagina = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = { page: pagina, limit: 20 };
      if (estado) params.estado = estado;
      const { data } = await empresaService.getCandidatos(params);
      setCandidatos(data.data ?? []);
      setPagination(data.pagination ?? null);
      setConteoPorEstado(data.conteoPorEstado ?? {});
    } catch {
      setError('No se pudieron cargar los candidatos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar(estadoParam, 1);
  }, [cargar, estadoParam]);

  const totalTodos = Object.values(conteoPorEstado).reduce((a, b) => a + b, 0);

  const handleTab = (valor) => {
    if (valor) setSearchParams({ estado: valor });
    else setSearchParams({});
  };

  return (
    <div className="page-container">
      <div className="dashboard-header">
        <div>
          <Link to="/empresa" className="btn-back">← Volver al panel</Link>
          <h1>Candidatos</h1>
          <p className={styles.subtitulo}>
            Todos los postulantes de todas tus ofertas.
          </p>
        </div>
      </div>

      {/* Tabs de filtro */}
      <div className="filter-chips">
        {ESTADOS_TABS.map(tab => {
          const n = tab.value === '' ? totalTodos : (conteoPorEstado[tab.value] ?? 0);
          return (
            <button
              key={tab.value}
              onClick={() => handleTab(tab.value)}
              className={`filter-chip ${estadoParam === tab.value ? 'is-active' : ''}`}
              aria-pressed={estadoParam === tab.value}
            >
              {tab.label} ({n})
            </button>
          );
        })}
      </div>

      {error && <p className="error-msg">{error}</p>}

      {loading ? (
        <p className="msg">Cargando candidatos...</p>
      ) : candidatos.length === 0 ? (
        <EmptyState
          icon="📭"
          title={`No hay candidatos${estadoParam ? ` en estado "${estadoParam}"` : ''} por el momento.`}
        />
      ) : (
        <TableResponsive minWidth={720}>
            <thead>
              <tr>
                <th>Candidato</th>
                <th>Email</th>
                <th>Oferta</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {candidatos.map(p => (
                <tr key={p.id}>
                  <td>
                    <div className={styles.celdaCandidato}>
                      <Avatar
                        src={p.usuario?.fotoPerfil}
                        nombre={p.usuario?.nombre}
                        apellido={p.usuario?.apellido}
                        size={32}
                        style={{ fontSize: '0.85rem' }}
                      />
                      {p.usuario?.id ? (
                        <Link to={`/perfil/${p.usuario.id}`} className={styles.linkPerfil}>
                          <strong>{p.usuario?.nombre} {p.usuario?.apellido}</strong>
                        </Link>
                      ) : (
                        <strong>{p.usuario?.nombre} {p.usuario?.apellido}</strong>
                      )}
                    </div>
                  </td>
                  <td className={`${styles.celdaEmail} cell-break`}>{p.usuario?.email}</td>
                  <td>
                    <span className={styles.ofertaTitulo}>{p.oferta?.titulo ?? '—'}</span>
                    {p.oferta?.area && <small className={styles.ofertaArea}>{p.oferta.area}</small>}
                  </td>
                  <td>
                    {(() => {
                      const info = getEstadoInfo(p.estado);
                      return (
                        <span
                          className={styles.estadoPill}
                          style={{ background: info.color + '22', color: info.color }}
                        >
                          {info.emoji} {info.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className={styles.celdaFecha}>{formatFecha(p.updatedAt)}</td>
                  <td>
                    {p.oferta?.id && (
                      <Link to={`/empresa/postulantes/${p.oferta.id}`} className="btn-small">
                        Ver oferta
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
        </TableResponsive>
      )}

      {!loading && (
        <Paginacion
          pagination={pagination}
          onPageChange={(p) => cargar(estadoParam, p)}
        />
      )}
    </div>
  );
}
