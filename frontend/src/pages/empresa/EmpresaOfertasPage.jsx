/**
 * EmpresaOfertasPage.jsx — Ofertas de la empresa (vista de supervisión).
 *
 * Ruta: /empresa/ofertas. Es donde el administrador de empresa supervisa TODAS
 * las publicaciones de su empresa: quién es el responsable, en qué estado
 * están y cuántas postulaciones tienen. No es la pantalla de creación.
 *
 * Permisos (la autoridad es el backend, esto solo los refleja):
 *   - admin_empresa: ver candidatos, pausar / reactivar / cerrar cualquier
 *     oferta y asignar o cambiar su reclutador responsable. Nunca editar el
 *     contenido.
 *   - reclutador: mismas acciones de estado solo sobre sus ofertas, y además
 *     "Editar contenido".
 *
 * Búsqueda y filtros (estado, moderación, responsable) se resuelven en el
 * servidor antes de paginar y viven en la URL, así la vista se puede recargar
 * o compartir: /empresa/ofertas?estado=pausada&responsable=12
 *
 * Cerrar es irreversible → pide confirmación. Pausar y reactivar son directos.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { empresaService } from '../../services/empresa.service';
import { ofertaService } from '../../services/oferta.service';
import { useAuth } from '../../hooks/useAuth';
import { useEmpresa } from '../../hooks/useEmpresa';
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
import AsignarResponsableModal from '../../components/AsignarResponsableModal/AsignarResponsableModal';
import Toast from '../../components/ui/Toast';
import Paginacion from '../../components/Paginacion/Paginacion';
import {
  ESTADO_LABEL, ESTADO_TONO, MODERACION_LABEL, MODERACION_TONO,
  OPCIONES_ESTADO, OPCIONES_MODERACION,
} from '../../utils/ofertaEstados';
import styles from './EmpresaOfertasPage.module.css';

const RESULTADO = { activa: 'reactivada', pausada: 'pausada', cerrada: 'cerrada' };
const fechaCorta = (o) => (o.createdAt ? new Date(o.createdAt).toLocaleDateString('es-AR') : '—');
const nombreResponsable = (o) => (o.creadaPor ? `${o.creadaPor.nombre} ${o.creadaPor.apellido}` : null);

function EstadoBadge({ estado }) {
  return <span className={`badge badge-tone-${ESTADO_TONO[estado] ?? 'gray'}`}>{ESTADO_LABEL[estado] ?? estado}</span>;
}

function ModeracionBadge({ estado }) {
  return <span className={`badge badge-tone-${MODERACION_TONO[estado] ?? 'gray'}`}>{MODERACION_LABEL[estado] ?? estado}</span>;
}

export default function EmpresaOfertasPage() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const { empresa, esAdminEmpresa, esReclutador } = useEmpresa();
  const esTabla = useMediaQuery('(min-width: 1024px)');
  const { toast, showToast } = useToast(4000);

  // Filtros en la URL (fuente de verdad); el texto se edita local y se aplica con debounce.
  const [params, setParams] = useSearchParams();
  const estado = params.get('estado') ?? '';
  const moderacion = params.get('moderacion') ?? '';
  const responsable = params.get('responsable') ?? '';
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

  const { page, setPage } = usePaginacion([estado, moderacion, responsable, q]);

  const [ofertas, setOfertas] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reclutadores, setReclutadores] = useState([]);
  const [accionando, setAccionando] = useState(null); // id de la oferta en proceso
  const [confirmarCierre, setConfirmarCierre] = useState(null); // oferta a cerrar
  const [cerrando, setCerrando] = useState(false);
  const [ofertaResponsable, setOfertaResponsable] = useState(null); // oferta a (re)asignar

  const secuencia = useRef(0); // descarta respuestas de consultas viejas

  const cargar = useCallback(async () => {
    const mia = ++secuencia.current;
    setLoading(true);
    setError('');
    try {
      const consulta = { page, limit: 20 };
      if (estado) consulta.estado = estado;
      if (moderacion) consulta.estadoModeracion = moderacion;
      if (responsable) consulta.responsable = responsable;
      if (q) consulta.q = q;
      const res = await empresaService.getMisOfertas(consulta);
      if (mia !== secuencia.current) return;
      setOfertas(res.data?.data ?? []);
      setPagination(res.data?.pagination ?? null);
    } catch {
      if (mia !== secuencia.current) return;
      setError('No se pudieron cargar las ofertas.');
    } finally {
      if (mia === secuencia.current) setLoading(false);
    }
  }, [page, estado, moderacion, responsable, q]);

  useEffect(() => { cargar(); }, [cargar]);

  // Reclutadores de la empresa para el filtro "Responsable".
  useEffect(() => {
    empresaService.getEquipo()
      .then((res) => {
        const lista = (res.data?.data ?? []).filter((m) => m.rolInterno === 'reclutador' && m.usuario);
        setReclutadores(lista.map((m) => ({ id: m.usuario.id, nombre: `${m.usuario.nombre} ${m.usuario.apellido}`, activo: m.activo })));
      })
      .catch(() => { /* el filtro queda sin opciones; el listado sigue funcionando */ });
  }, []);

  const puedeGestionar = (o) => esAdminEmpresa || !o.creadaPorUsuarioId || o.creadaPorUsuarioId === usuario?.id;
  const puedeEditar = (o) => esReclutador && (!o.creadaPorUsuarioId || o.creadaPorUsuarioId === usuario?.id);

  const cambiarEstado = async (oferta, nuevoEstado) => {
    setAccionando(oferta.id);
    setError('');
    try {
      await ofertaService.cambiarEstado(oferta.id, nuevoEstado);
      showToast(`Oferta ${RESULTADO[nuevoEstado]} correctamente.`, 'success');
      await cargar();
      return true;
    } catch (err) {
      setError(err.response?.data?.message ?? 'No se pudo cambiar el estado de la oferta.');
      return false;
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

  // El responsable de la oferta dejó de ser un reclutador activo (se muestra
  // igual, por historial; el admin_empresa puede cambiarlo).
  const responsableSuspendido = (o) => reclutadores.some((r) => r.id === o.creadaPorUsuarioId && !r.activo);

  const responsableAsignado = async (mensaje) => {
    setOfertaResponsable(null);
    showToast(mensaje, 'success');
    await cargar();
  };

  const accionesDe = (o) => {
    const items = [];
    if (puedeEditar(o)) {
      items.push({ key: 'editar', label: 'Editar contenido', onSelect: () => navigate(`/empresa/ofertas/${o.id}/editar`) });
    }
    // Gobierno de la empresa: solo el administrador de empresa asigna responsables.
    if (esAdminEmpresa) {
      items.push({
        key: 'responsable',
        label: o.creadaPorUsuarioId ? 'Cambiar responsable' : 'Asignar responsable',
        onSelect: () => setOfertaResponsable(o),
      });
    }
    if (puedeGestionar(o)) {
      const estados = [];
      if (o.estado === 'activa') estados.push({ key: 'pausar', label: 'Pausar publicación', onSelect: () => cambiarEstado(o, 'pausada') });
      if (o.estado === 'pausada') estados.push({ key: 'reactivar', label: 'Reactivar publicación', onSelect: () => cambiarEstado(o, 'activa') });
      if (o.estado !== 'cerrada') estados.push({ key: 'cerrar', label: 'Cerrar publicación', danger: true, onSelect: () => setConfirmarCierre(o) });
      if (estados.length > 0 && items.length > 0) estados[0].separatorBefore = true;
      items.push(...estados);
    }
    return items;
  };

  const celdaResponsable = (o) => {
    const nombre = nombreResponsable(o);
    if (!nombre) return <span className={styles.sinDato}>Sin responsable asignado</span>;
    return (
      <>
        {nombre}
        {responsableSuspendido(o) && <small className={styles.sub}>Suspendido</small>}
      </>
    );
  };

  const renderAcciones = (oferta) => (
    <div className={styles.acciones}>
      <Link
        to={`/empresa/postulantes/${oferta.id}`}
        className="btn-small"
        aria-label={`Ver candidatos de ${oferta.titulo}`}
      >
        Ver candidatos
      </Link>
      <ActionMenu
        label={`Más acciones para la oferta ${oferta.titulo}`}
        items={accionesDe(oferta)}
        disabled={accionando === oferta.id}
      />
    </div>
  );

  const hayFiltros = Boolean(estado || moderacion || responsable || q);
  const limpiarFiltros = () => { setTexto(''); setParams({}, { replace: true }); };

  const total = pagination?.total ?? ofertas.length;
  const primeraCarga = loading && ofertas.length === 0 && !error;

  return (
    <div className="page-container">
      <Toast toast={toast} />

      <PageHeader
        title="Ofertas"
        subtitle="Supervisá las publicaciones de tu empresa y su estado."
        actions={esReclutador && (
          <Link to="/empresa/nueva-oferta" className="btn-primary">Nueva oferta</Link>
        )}
      />

      {error && <p className={`error-msg ${styles.error}`} role="alert">{error}</p>}

      <div className={styles.toolbar}>
        <div className={styles.fila}>
          <div className={styles.busqueda}>
            <SearchField
              id="busqueda-oferta"
              label="Buscar ofertas"
              placeholder="Buscar por título, área o responsable…"
              value={texto}
              onChange={setTexto}
            />
          </div>
          <div className={styles.campo}>
            <label htmlFor="filtro-responsable" className={styles.srOnly}>Responsable</label>
            <select
              id="filtro-responsable"
              value={responsable}
              onChange={(e) => setFiltro('responsable', e.target.value)}
            >
              <option value="">Todos los responsables</option>
              {reclutadores.map((r) => (
                <option key={r.id} value={r.id}>{r.nombre}{r.activo ? '' : ' (suspendido)'}</option>
              ))}
              <option value="sin">Sin responsable asignado</option>
            </select>
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
        {loading ? 'Buscando…' : `${total} oferta${total !== 1 ? 's' : ''} encontrada${total !== 1 ? 's' : ''}`}
      </p>

      {primeraCarga ? (
        <p className="msg" role="status">Cargando ofertas...</p>
      ) : ofertas.length === 0 && !error ? (
        <EmptyState
          iconName="briefcase"
          title={hayFiltros ? 'No hay ofertas con esos criterios.' : 'La empresa todavía no tiene ofertas publicadas.'}
          hint={hayFiltros
            ? 'Probá con otro texto o quitá algún filtro.'
            : (esAdminEmpresa ? 'Las ofertas las publican los reclutadores del equipo.' : undefined)}
        >
          {hayFiltros && <button type="button" className="btn-secondary" onClick={limpiarFiltros}>Limpiar filtros</button>}
        </EmptyState>
      ) : ofertas.length > 0 && (
        <div className={loading ? styles.recargando : undefined} aria-busy={loading}>
          {esTabla ? (
            <TableResponsive minWidth={880}>
              <thead>
                <tr>
                  <th>Oferta</th>
                  <th>Responsable</th>
                  <th>Estado</th>
                  <th>Moderación</th>
                  <th>Vacantes / Postulados</th>
                  <th>Publicada</th>
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
                    <td className="cell-break">{celdaResponsable(o)}</td>
                    <td><EstadoBadge estado={o.estado} /></td>
                    <td><ModeracionBadge estado={o.estadoModeracion} /></td>
                    <td className={styles.numeros}>{o.cantidadVacantes ?? '—'} / <strong>{o.totalPostulaciones}</strong></td>
                    <td className={styles.fecha}>{fechaCorta(o)}</td>
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
                    {
                      label: 'Responsable',
                      value: nombreResponsable(o)
                        ? `${nombreResponsable(o)}${responsableSuspendido(o) ? ' (suspendido)' : ''}`
                        : 'Sin responsable asignado',
                    },
                    { label: 'Moderación', value: <ModeracionBadge estado={o.estadoModeracion} /> },
                    { label: 'Vacantes / Postulados', value: `${o.cantidadVacantes ?? '—'} / ${o.totalPostulaciones}` },
                    { label: 'Publicada', value: fechaCorta(o) },
                  ]}
                  actions={renderAcciones(o)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {!primeraCarga && <Paginacion pagination={pagination} onPageChange={setPage} />}

      {ofertaResponsable && (
        <AsignarResponsableModal
          oferta={ofertaResponsable}
          reclutadores={reclutadores.filter((r) => r.activo)}
          empresaNombre={empresa?.razonSocial}
          onClose={() => setOfertaResponsable(null)}
          onAsignado={responsableAsignado}
        />
      )}

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
