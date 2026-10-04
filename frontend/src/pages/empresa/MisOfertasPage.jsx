/**
 * MisOfertasPage.jsx — "Mis ofertas" del RECLUTADOR.
 *
 * Ruta: /empresa/ofertas (cuando el rol interno es reclutador; el administrador
 * de empresa ve EmpresaOfertasPage, la vista corporativa — ver OfertasEmpresaPage).
 *
 * Consume GET /api/empresas/mis-ofertas: para un reclutador el backend devuelve
 * SOLO las ofertas a su cargo, así que acá no hay filtro ni columna de
 * responsable, ni filas de otros reclutadores.
 *
 * Búsqueda y filtros (estado, moderación) se resuelven en el servidor y viven
 * en la URL: /empresa/ofertas?estado=activa&moderacion=pendiente
 *
 * Acciones por oferta: "Gestionar candidatos" + menú ⋯ (editar, pausar /
 * reactivar, cerrar). Solo se muestran las que aplican al estado actual; cerrar
 * es irreversible y pide confirmación. Una oferta cerrada conserva "Gestionar
 * candidatos": cerrar solo corta las postulaciones nuevas; el proceso de
 * selección de quienes ya se postularon sigue (regla del backend).
 *
 * "Nueva oferta" no se repite en la cabecera (es la acción global de la barra);
 * solo aparece en el EmptyState cuando no hay ninguna oferta.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { empresaService } from '../../services/empresa.service';
import { ofertaService } from '../../services/oferta.service';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { usePaginacion } from '../../hooks/usePaginacion';
import { useToast } from '../../hooks/useToast';
import PageHeader from '../../components/ui/PageHeader';
import SearchField from '../../components/ui/SearchField';
import FilterGroup from '../../components/ui/FilterGroup';
import TableResponsive from '../../components/ui/TableResponsive';
import DataCard from '../../components/ui/DataCard';
import EmptyState from '../../components/ui/EmptyState';
import ActionMenu from '../../components/ui/ActionMenu';
import ConfirmModal from '../../components/ui/ConfirmModal';
import Toast from '../../components/ui/Toast';
import Paginacion from '../../components/Paginacion/Paginacion';
import { ESTADO_LABEL, ESTADO_TONO, MODERACION_LABEL, MODERACION_TONO } from '../../utils/ofertaEstados';
import styles from './EmpresaOfertasPage.module.css';

const OPCIONES_ESTADO = [
  { value: '', label: 'Todas' },
  { value: 'activa', label: 'Activas' },
  { value: 'pausada', label: 'Pausadas' },
  { value: 'cerrada', label: 'Cerradas' },
];
const OPCIONES_MODERACION = [
  { value: '', label: 'Todas' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'aprobada', label: 'Aprobadas' },
  { value: 'rechazada', label: 'Rechazadas' },
  { value: 'auto_aprobada', label: 'Publicación automática' },
];

const RESULTADO = { activa: 'reactivada', pausada: 'pausada', cerrada: 'cerrada' };
const fechaCorta = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR') : '—');

function EstadoBadge({ estado }) {
  return <span className={`badge badge-tone-${ESTADO_TONO[estado] ?? 'gray'}`}>{ESTADO_LABEL[estado] ?? estado}</span>;
}

function ModeracionBadge({ estado }) {
  return <span className={`badge badge-tone-${MODERACION_TONO[estado] ?? 'gray'}`}>{MODERACION_LABEL[estado] ?? estado}</span>;
}

export default function MisOfertasPage() {
  const navigate = useNavigate();
  const esTabla = useMediaQuery('(min-width: 1024px)');
  const { toast, showToast } = useToast(4000);

  const [params, setParams] = useSearchParams();
  const estado = params.get('estado') ?? '';
  const moderacion = params.get('moderacion') ?? '';
  const qUrl = params.get('q') ?? '';

  const [texto, setTexto] = useState(qUrl);
  const q = useDebouncedValue(texto.trim(), 350);

  const setFiltro = useCallback((clave, valor) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (valor) next.set(clave, valor); else next.delete(clave);
      return next;
    }, { replace: true });
  }, [setParams]);

  useEffect(() => { if (q !== qUrl) setFiltro('q', q); }, [q, qUrl, setFiltro]);

  const { page, setPage } = usePaginacion([estado, moderacion, q]);

  const [ofertas, setOfertas] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accionando, setAccionando] = useState(null);
  const [confirmarCierre, setConfirmarCierre] = useState(null);
  const [cerrando, setCerrando] = useState(false);

  const secuencia = useRef(0); // descarta respuestas de consultas viejas

  const cargar = useCallback(async () => {
    const mia = ++secuencia.current;
    setLoading(true);
    setError('');
    try {
      const consulta = { page, limit: 20 };
      if (estado) consulta.estado = estado;
      if (moderacion) consulta.estadoModeracion = moderacion;
      if (q) consulta.q = q;
      const res = await empresaService.getMisOfertas(consulta);
      if (mia !== secuencia.current) return;
      setOfertas(res.data?.data ?? []);
      setPagination(res.data?.pagination ?? null);
    } catch {
      if (mia !== secuencia.current) return;
      setError('No se pudieron cargar tus ofertas.');
    } finally {
      if (mia === secuencia.current) setLoading(false);
    }
  }, [page, estado, moderacion, q]);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiarEstado = async (oferta, nuevoEstado) => {
    setAccionando(oferta.id);
    setError('');
    try {
      await ofertaService.cambiarEstado(oferta.id, nuevoEstado);
      showToast(`Oferta ${RESULTADO[nuevoEstado]} correctamente.`, 'success');
      await cargar();
    } catch (err) {
      setError(err.response?.data?.message ?? 'No se pudo cambiar el estado de la oferta.');
    } finally {
      setAccionando(null);
    }
  };

  const confirmarCerrar = async () => {
    setCerrando(true);
    await cambiarEstado(confirmarCierre, 'cerrada');
    setCerrando(false);
    setConfirmarCierre(null);
  };

  // Solo las acciones posibles en el estado actual (una oferta cerrada no se reabre).
  const accionesDe = (o) => {
    const items = [{ key: 'editar', label: 'Editar oferta', onSelect: () => navigate(`/empresa/ofertas/${o.id}/editar`) }];
    if (o.estado === 'activa') items.push({ key: 'pausar', label: 'Pausar oferta', separatorBefore: true, onSelect: () => cambiarEstado(o, 'pausada') });
    if (o.estado === 'pausada') items.push({ key: 'reactivar', label: 'Reactivar oferta', separatorBefore: true, onSelect: () => cambiarEstado(o, 'activa') });
    if (o.estado !== 'cerrada') items.push({ key: 'cerrar', label: 'Cerrar oferta', danger: true, onSelect: () => setConfirmarCierre(o) });
    return items;
  };

  const renderAcciones = (o) => (
    <div className={styles.acciones}>
      <Link to={`/empresa/postulantes/${o.id}`} className="btn-small" aria-label={`Gestionar candidatos de ${o.titulo}`}>
        Gestionar candidatos
      </Link>
      <ActionMenu label={`Más acciones para la oferta ${o.titulo}`} items={accionesDe(o)} disabled={accionando === o.id} />
    </div>
  );

  const hayFiltros = Boolean(estado || moderacion || q);
  const limpiarFiltros = () => { setTexto(''); setParams({}, { replace: true }); };
  const total = pagination?.total ?? ofertas.length;
  const primeraCarga = loading && ofertas.length === 0 && !error;

  return (
    <div className="page-container">
      <Toast toast={toast} />

      <PageHeader
        title="Mis ofertas"
        subtitle="Gestioná las publicaciones que tenés asignadas."
      />

      {error && <p className={`error-msg ${styles.error}`} role="alert">{error}</p>}

      <div className={styles.toolbar}>
        <div className={styles.fila}>
          <div className={styles.busqueda}>
            <SearchField
              id="busqueda-mis-ofertas"
              label="Buscar en mis ofertas"
              placeholder="Buscar por título o área…"
              value={texto}
              onChange={setTexto}
            />
          </div>
        </div>
        <div className={styles.grupos}>
          <FilterGroup
            label="Estado" idPrefix="filtro-estado" options={OPCIONES_ESTADO}
            value={estado} onChange={(v) => setFiltro('estado', v)}
          />
          <FilterGroup
            label="Moderación" idPrefix="filtro-moderacion" options={OPCIONES_MODERACION}
            value={moderacion} onChange={(v) => setFiltro('moderacion', v)}
          />
        </div>
      </div>

      <p className={styles.resultados} role="status" aria-live="polite">
        {loading ? 'Buscando…' : `${total} oferta${total !== 1 ? 's' : ''}`}
      </p>

      {primeraCarga ? (
        <p className="msg" role="status">Cargando ofertas...</p>
      ) : ofertas.length === 0 && !error ? (
        <EmptyState
          iconName="briefcase"
          title={hayFiltros ? 'No tenés ofertas con esos criterios.' : 'Todavía no tenés ofertas asignadas.'}
          hint={hayFiltros ? 'Probá con otro texto o quitá algún filtro.' : 'Publicá tu primera oferta para empezar a recibir postulaciones.'}
        >
          {hayFiltros
            ? <button type="button" className="btn-secondary" onClick={limpiarFiltros}>Limpiar filtros</button>
            : <Link to="/empresa/nueva-oferta" className="btn-primary">Nueva oferta</Link>}
        </EmptyState>
      ) : ofertas.length > 0 && (
        <div className={loading ? styles.recargando : undefined} aria-busy={loading}>
          {esTabla ? (
            <TableResponsive minWidth={860}>
              <thead>
                <tr>
                  <th>Oferta</th>
                  <th>Estado</th>
                  <th>Moderación</th>
                  <th>Candidatos</th>
                  <th>Vacantes</th>
                  <th>Cierre</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ofertas.map((o) => (
                  <tr key={o.id}>
                    <td className="cell-break">
                      <strong>{o.titulo}</strong>
                      <small className={styles.sub}>{[o.area, o.modalidad].filter(Boolean).join(' · ') || '—'}</small>
                    </td>
                    <td><EstadoBadge estado={o.estado} /></td>
                    <td><ModeracionBadge estado={o.estadoModeracion} /></td>
                    <td className={styles.numeros}><strong>{o.totalPostulaciones}</strong></td>
                    <td className={styles.numeros}>{o.cantidadVacantes ?? '—'}</td>
                    <td className={styles.fecha}>{fechaCorta(o.fechaLimite)}</td>
                    <td>{renderAcciones(o)}</td>
                  </tr>
                ))}
              </tbody>
            </TableResponsive>
          ) : (
            <div className={styles.cards}>
              {ofertas.map((o) => (
                <DataCard
                  key={o.id}
                  title={o.titulo}
                  subtitle={[o.area, o.modalidad].filter(Boolean).join(' · ') || undefined}
                  badge={<EstadoBadge estado={o.estado} />}
                  fields={[
                    { label: 'Moderación', value: <ModeracionBadge estado={o.estadoModeracion} /> },
                    { label: 'Candidatos', value: String(o.totalPostulaciones) },
                    { label: 'Vacantes', value: o.cantidadVacantes != null ? String(o.cantidadVacantes) : null },
                    { label: 'Cierre', value: o.fechaLimite ? fechaCorta(o.fechaLimite) : null },
                  ]}
                  actions={renderAcciones(o)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {!primeraCarga && <Paginacion pagination={pagination} onPageChange={setPage} />}

      {confirmarCierre && (
        <ConfirmModal
          title="Cerrar oferta"
          confirmLabel="Cerrar oferta"
          tone="danger"
          busy={cerrando}
          onConfirm={confirmarCerrar}
          onClose={() => setConfirmarCierre(null)}
          confirmId="btn-confirmar-cerrar-oferta"
        >
          <p>Oferta: <strong>{confirmarCierre.titulo}</strong></p>
          <p>
            La oferta dejará de recibir postulaciones. El cierre es definitivo: una oferta cerrada no
            se puede reabrir. Las postulaciones ya recibidas se conservan.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
