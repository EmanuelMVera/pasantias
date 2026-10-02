/**
 * CandidatosEmpresaPage.jsx — Candidatos de la empresa (vista de SUPERVISIÓN).
 *
 * Muestra las postulaciones de todas las ofertas de la empresa con la oferta y
 * su reclutador responsable. No gestiona candidatos: "Ver proceso" lleva al
 * detalle de la oferta (/empresa/postulantes/:ofertaId), donde el reclutador
 * responsable opera y el administrador de empresa solo observa.
 *
 * Filtros (todos server-side, antes de paginar, y reflejados en la URL para
 * poder recargar o compartir la vista):
 *   /empresa/candidatos?estado=entrevista&responsable=522&oferta=14
 * Los contadores por estado corresponden al alcance filtrado por
 * responsable/oferta.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { empresaService } from '../../services/empresa.service';
import { useEmpresa } from '../../hooks/useEmpresa';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { usePaginacion } from '../../hooks/usePaginacion';
import Avatar from '../../components/Avatar/Avatar';
import Paginacion from '../../components/Paginacion/Paginacion';
import PageHeader from '../../components/ui/PageHeader';
import FilterGroup from '../../components/ui/FilterGroup';
import TableResponsive from '../../components/ui/TableResponsive';
import DataCard from '../../components/ui/DataCard';
import EmptyState from '../../components/ui/EmptyState';
import Icon from '../../components/ui/Icon';
import { getEstadoInfo } from '../../constants/postulacionEstados';
import toolbar from './EmpresaOfertasPage.module.css';
import styles from './CandidatosEmpresaPage.module.css';

// Labels en plural para el filtro — los `value` son los estados canónicos de
// constants/postulacionEstados.js (fuente de label/tono/ícono).
const ESTADOS_FILTRO = [
  { value: '',                label: 'Todos' },
  { value: 'en_revision',     label: 'En revisión' },
  { value: 'preseleccionado', label: 'Preseleccionados' },
  { value: 'entrevista',      label: 'Entrevista' },
  { value: 'contratado',      label: 'Contratados' },
  { value: 'rechazado',       label: 'No seleccionados' },
];

function formatFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const nombreCompleto = (u) => (u ? `${u.nombre ?? ''} ${u.apellido ?? ''}`.trim() : '');
const nombreResponsable = (oferta) => (oferta?.creadaPor ? nombreCompleto(oferta.creadaPor) : null);

function EstadoBadge({ estado }) {
  const info = getEstadoInfo(estado);
  return (
    <span className={`badge badge-tone-${info.tone}`}>
      <Icon name={info.icon} size={14} strokeWidth={2} />
      {info.label}
    </span>
  );
}

export default function CandidatosEmpresaPage() {
  const { esAdminEmpresa } = useEmpresa();
  const esTabla = useMediaQuery('(min-width: 1024px)');

  const [params, setParams] = useSearchParams();
  const estado = params.get('estado') ?? '';
  const responsable = params.get('responsable') ?? '';
  const ofertaId = params.get('oferta') ?? '';

  const setFiltro = (clave, valor) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (valor) next.set(clave, valor); else next.delete(clave);
      return next;
    }, { replace: true });
  };

  const { page, setPage } = usePaginacion([estado, responsable, ofertaId]);

  const [candidatos, setCandidatos] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [pagination, setPagination] = useState(null);
  const [conteoPorEstado, setConteoPorEstado] = useState({});
  const [reclutadores, setReclutadores] = useState([]);
  const [ofertas, setOfertas] = useState([]);

  const secuencia = useRef(0);

  const cargar = useCallback(async () => {
    const mia = ++secuencia.current;
    setLoading(true);
    setError('');
    try {
      const consulta = { page, limit: 20 };
      if (estado) consulta.estado = estado;
      if (responsable) consulta.responsable = responsable;
      if (ofertaId) consulta.ofertaId = ofertaId;
      const { data } = await empresaService.getCandidatos(consulta);
      if (mia !== secuencia.current) return;
      setCandidatos(data.data ?? []);
      setPagination(data.pagination ?? null);
      setConteoPorEstado(data.conteoPorEstado ?? {});
    } catch {
      if (mia !== secuencia.current) return;
      setError('No se pudieron cargar los candidatos.');
    } finally {
      if (mia === secuencia.current) setLoading(false);
    }
  }, [page, estado, responsable, ofertaId]);

  useEffect(() => { cargar(); }, [cargar]);

  // Opciones de los filtros Responsable y Oferta (datos reales de la empresa).
  useEffect(() => {
    empresaService.getEquipo()
      .then((res) => {
        const lista = (res.data?.data ?? []).filter((m) => m.rolInterno === 'reclutador' && m.usuario);
        setReclutadores(lista.map((m) => ({ id: m.usuario.id, nombre: nombreCompleto(m.usuario), activo: m.activo })));
      })
      .catch(() => {});
    empresaService.getMisOfertas({ limit: 100 })
      .then((res) => setOfertas((res.data?.data ?? []).map((o) => ({ id: o.id, titulo: o.titulo }))))
      .catch(() => {});
  }, []);

  const totalTodos = Object.values(conteoPorEstado).reduce((a, b) => a + b, 0);
  const opcionesEstado = ESTADOS_FILTRO.map((op) => ({
    value: op.value,
    label: `${op.label} (${op.value === '' ? totalTodos : (conteoPorEstado[op.value] ?? 0)})`,
  }));

  const hayFiltros = Boolean(estado || responsable || ofertaId);
  const total = pagination?.total ?? candidatos.length;
  const primeraCarga = loading && candidatos.length === 0 && !error;

  const enlaceProceso = (p) => p.oferta?.id && (
    <Link
      to={`/empresa/postulantes/${p.oferta.id}`}
      className="btn-small"
      aria-label={`Ver proceso de ${p.oferta.titulo}`}
    >
      Ver proceso
    </Link>
  );

  return (
    <div className="page-container">
      <PageHeader
        title="Candidatos"
        subtitle={esAdminEmpresa
          ? 'Supervisá los procesos de selección de todas las ofertas de la empresa.'
          : 'Postulantes de las ofertas de la empresa.'}
      />

      {error && <p className={`error-msg ${toolbar.error}`} role="alert">{error}</p>}

      <div className={toolbar.toolbar}>
        <div className={toolbar.fila}>
          <div className={toolbar.campo}>
            <label htmlFor="filtro-responsable" className={toolbar.srOnly}>Responsable</label>
            <select id="filtro-responsable" value={responsable} onChange={(e) => setFiltro('responsable', e.target.value)}>
              <option value="">Todos los responsables</option>
              {reclutadores.map((r) => (
                <option key={r.id} value={r.id}>{r.nombre}{r.activo ? '' : ' (suspendido)'}</option>
              ))}
              <option value="sin">Sin responsable asignado</option>
            </select>
          </div>
          <div className={`${toolbar.campo} ${styles.campoOferta}`}>
            <label htmlFor="filtro-oferta" className={toolbar.srOnly}>Oferta</label>
            <select id="filtro-oferta" value={ofertaId} onChange={(e) => setFiltro('oferta', e.target.value)}>
              <option value="">Todas las ofertas</option>
              {ofertas.map((o) => <option key={o.id} value={o.id}>{o.titulo}</option>)}
            </select>
          </div>
        </div>
        <FilterGroup
          label="Estado" idPrefix="filtro-estado" options={opcionesEstado} gridMobile
          value={estado} onChange={(v) => setFiltro('estado', v)}
        />
      </div>

      <p className={toolbar.resultados} role="status" aria-live="polite">
        {loading ? 'Buscando…' : `${total} candidato${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`}
      </p>

      {primeraCarga ? (
        <p className="msg" role="status">Cargando candidatos...</p>
      ) : candidatos.length === 0 && !error ? (
        <EmptyState
          iconName="users"
          title={hayFiltros ? 'No hay candidatos con esos criterios.' : 'No hay candidatos por el momento.'}
          hint={hayFiltros ? 'Probá quitando algún filtro.' : undefined}
        >
          {hayFiltros && (
            <button type="button" className="btn-secondary" onClick={() => setParams({}, { replace: true })}>
              Limpiar filtros
            </button>
          )}
        </EmptyState>
      ) : candidatos.length > 0 && (
        <div className={loading ? toolbar.recargando : undefined} aria-busy={loading}>
          {esTabla ? (
            <TableResponsive minWidth={820}>
              <thead>
                <tr>
                  <th>Candidato</th>
                  <th>Oferta</th>
                  <th>Responsable</th>
                  <th>Estado</th>
                  <th>Actualizado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {candidatos.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className={toolbar.userCell}>
                        <Avatar
                          src={p.usuario?.fotoPerfil}
                          nombre={p.usuario?.nombre}
                          apellido={p.usuario?.apellido}
                          size={34}
                          style={{ fontSize: '0.85rem' }}
                        />
                        {p.usuario?.id ? (
                          <Link to={`/perfil/${p.usuario.id}`} className={styles.linkPerfil}>
                            {nombreCompleto(p.usuario)}
                          </Link>
                        ) : (
                          <strong>{nombreCompleto(p.usuario)}</strong>
                        )}
                      </div>
                    </td>
                    <td className="cell-break">
                      {p.oferta?.titulo ?? '—'}
                      {p.oferta?.area && <small className={toolbar.sub}>{p.oferta.area}</small>}
                    </td>
                    <td className="cell-break">
                      {nombreResponsable(p.oferta) ?? <span className={toolbar.sinDato}>Sin responsable asignado</span>}
                    </td>
                    <td><EstadoBadge estado={p.estado} /></td>
                    <td className={toolbar.fecha}>{formatFecha(p.updatedAt)}</td>
                    <td>{enlaceProceso(p)}</td>
                  </tr>
                ))}
              </tbody>
            </TableResponsive>
          ) : (
            <div className={toolbar.cards}>
              {candidatos.map((p) => (
                <DataCard
                  key={p.id}
                  title={nombreCompleto(p.usuario) || 'Candidato'}
                  subtitle={p.oferta?.titulo}
                  badge={<EstadoBadge estado={p.estado} />}
                  fields={[
                    { label: 'Responsable', value: nombreResponsable(p.oferta) ?? 'Sin responsable asignado' },
                    { label: 'Actualizado', value: formatFecha(p.updatedAt) },
                  ]}
                  actions={(
                    <>
                      {enlaceProceso(p)}
                      {p.usuario?.id && <Link to={`/perfil/${p.usuario.id}`} className="btn-secondary">Ver perfil</Link>}
                    </>
                  )}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {!primeraCarga && <Paginacion pagination={pagination} onPageChange={setPage} />}
    </div>
  );
}
