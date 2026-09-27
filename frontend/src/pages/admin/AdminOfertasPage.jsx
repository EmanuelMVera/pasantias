/**
 * AdminOfertasPage.jsx — Moderación post-publicación de ofertas.
 *
 * Dos ejes independientes (RBAC-04 — antes mezclados en `estado`+`moderada`):
 *   - Moderación (estadoModeracion): pendiente | aprobada | rechazada | auto_aprobada.
 *     Acciones: aprobar, rechazar.
 *   - Ciclo de vida (estado): activa | pausada | cerrada.
 *     Acciones del admin: pausar, cerrar (nunca "activar" — eso es de la empresa).
 * Las dos acciones de moderación y las dos de ciclo de vida nunca tocan el
 * campo del otro eje (ver adminModeracion.service.js en el backend).
 *
 * Una sola interfaz con dos pestañas (solo se renderiza la activa):
 *   - Pendientes (n): cola de moderación (estadoModeracion=pendiente). Aprobar y
 *     Rechazar a la vista; Pausar/Cerrar en el menú "⋯".
 *     En ofertas ya moderadas (aprobada / publicación automática) "Rechazar
 *     publicación" es excepcional: va dentro del menú "⋯", no como botón rojo.
 *   - Todas: historial con filtros por estado y por moderación.
 * Ambas usan el mismo listado paginado (GET /admin/ofertas); el contador de
 * "Pendientes" sale del total de esa misma consulta.
 *
 * Rechazar y Cerrar son irreversibles (el backend no tiene transición de salida):
 * piden confirmación en un modal. Aprobar y Pausar se ejecutan directo.
 *
 * Ruta: /admin/ofertas  (`?tab=todas` abre la segunda pestaña)
 * Rol: admin
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminService } from '../../services/admin.service';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { usePaginacion } from '../../hooks/usePaginacion';
import { useToast } from '../../hooks/useToast';
import PageHeader from '../../components/ui/PageHeader';
import Tabs, { TabPanel } from '../../components/ui/Tabs';
import FilterGroup from '../../components/ui/FilterGroup';
import TableResponsive from '../../components/ui/TableResponsive';
import DataCard from '../../components/ui/DataCard';
import EmptyState from '../../components/ui/EmptyState';
import ActionMenu from '../../components/ui/ActionMenu';
import ConfirmModal from '../../components/ui/ConfirmModal';
import Toast from '../../components/ui/Toast';
import Icon from '../../components/ui/Icon';
import Paginacion from '../../components/Paginacion/Paginacion';
import styles from './AdminOfertasPage.module.css';
import {
  ESTADO_TONO, ESTADO_LABEL, MODERACION_TONO, MODERACION_LABEL,
  OPCIONES_ESTADO, OPCIONES_MODERACION,
  puedeAprobar, puedeRechazar, puedePausar, puedeCerrar,
} from './ofertasModeracion.utils';

const RESULTADO_ACCION = { aprobar: 'aprobada', pausar: 'pausada', rechazar: 'rechazada', cerrar: 'cerrada' };

const ACCIONES_CON_CONFIRMACION = {
  rechazar: {
    titulo: 'Rechazar oferta',
    confirmar: 'Rechazar oferta',
    detalle: 'La empresa será notificada y la oferta dejará de estar disponible para los alumnos. Una oferta rechazada no se puede volver a aprobar.',
  },
  cerrar: {
    titulo: 'Cerrar oferta',
    confirmar: 'Cerrar oferta',
    detalle: 'La oferta dejará de recibir postulaciones. El cierre es definitivo: una oferta cerrada no se puede reabrir.',
  },
};

const fechaCorta = (o) => (o.createdAt ? new Date(o.createdAt).toLocaleDateString('es-AR') : '—');

function EstadoBadge({ estado }) {
  return (
    <span className={`badge badge-tone-${ESTADO_TONO[estado] ?? 'gray'}`}>
      {ESTADO_LABEL[estado] ?? estado}
    </span>
  );
}

function ModeracionBadge({ estado }) {
  return (
    <span className={`badge badge-tone-${MODERACION_TONO[estado] ?? 'gray'}`}>
      {MODERACION_LABEL[estado] ?? estado}
    </span>
  );
}

/**
 * Acciones de una fila (máximo dos botones fuertes a la vista):
 * - Pendiente de moderación → Aprobar + Rechazar visibles.
 * - Ya moderada → Rechazar pasa al menú "⋯" como "Rechazar publicación".
 * Pausar y Cerrar siempre en el menú secundario. Mismas reglas de transición
 * que el backend (ofertasModeracion.utils).
 */
function AccionesOferta({ oferta, ocupado, onAccion }) {
  const aprobar = puedeAprobar(oferta);
  const enCola = oferta.estadoModeracion === 'pendiente';
  const rechazar = puedeRechazar(oferta) && enCola;

  const extras = [];
  if (puedePausar(oferta)) extras.push({ key: 'pausar', label: 'Pausar publicación', onSelect: () => onAccion(oferta, 'pausar') });
  if (puedeCerrar(oferta)) extras.push({ key: 'cerrar', label: 'Cerrar publicación', onSelect: () => onAccion(oferta, 'cerrar'), danger: true });
  if (puedeRechazar(oferta) && !enCola) {
    extras.push({ key: 'rechazar', label: 'Rechazar publicación', onSelect: () => onAccion(oferta, 'rechazar'), danger: true });
  }

  if (!aprobar && !rechazar && extras.length === 0) return <span className={styles.sinAcciones}>—</span>;

  return (
    <div className={styles.acciones}>
      {aprobar && (
        <button
          type="button"
          className="btn-ok"
          disabled={ocupado}
          onClick={() => onAccion(oferta, 'aprobar')}
          aria-label={`Aprobar oferta ${oferta.titulo}`}
          title="La oferta queda visible para los alumnos (si además está activa)"
        >
          <Icon name="check" size={16} strokeWidth={2.2} />
          Aprobar
        </button>
      )}
      {rechazar && (
        <button
          type="button"
          className="btn-danger"
          disabled={ocupado}
          onClick={() => onAccion(oferta, 'rechazar')}
          aria-label={`Rechazar oferta ${oferta.titulo}`}
          title="La empresa es notificada"
        >
          Rechazar
        </button>
      )}
      <ActionMenu
        label={`Más acciones para la oferta ${oferta.titulo}`}
        items={extras}
        disabled={ocupado}
      />
    </div>
  );
}

export default function AdminOfertasPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'todas' ? 'todas' : 'pendientes';
  const setTab = (t) => setSearchParams(t === 'pendientes' ? {} : { tab: t }, { replace: true });

  const esTabla = useMediaQuery('(min-width: 1024px)');
  const { toast, showToast } = useToast(5000);

  const [ofertas,    setOfertas]    = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [conteoPend, setConteoPend] = useState(null);
  const [accionando, setAccionando] = useState(null); // id de la oferta en proceso
  const [confirmar,  setConfirmar]  = useState(null); // { oferta, accion } esperando confirmación

  const [filtroEstado,     setFiltroEstado]     = useState('');
  const [filtroModeracion, setFiltroModeracion] = useState('');
  const { page, setPage } = usePaginacion([tab, filtroEstado, filtroModeracion]);

  // Descarta respuestas de consultas viejas (cambio rápido de pestaña/filtro).
  const secuencia = useRef(0);

  const cargar = useCallback(async () => {
    const mia = ++secuencia.current;
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 25 };
      if (tab === 'pendientes') {
        params.estadoModeracion = 'pendiente';
      } else {
        if (filtroEstado)     params.estado           = filtroEstado;
        if (filtroModeracion) params.estadoModeracion = filtroModeracion;
      }
      const res = await adminService.getTodasOfertas(params);
      if (mia !== secuencia.current) return;
      const data = res.data?.data ?? [];
      const pag = res.data?.pagination ?? null;
      // Se resolvió la última oferta de la última página: volver a la anterior.
      if (data.length === 0 && page > 1 && pag && pag.totalPages < page) {
        setPage(pag.totalPages);
        return;
      }
      setOfertas(data);
      setPagination(pag);
    } catch {
      if (mia !== secuencia.current) return;
      setError('No se pudieron cargar las ofertas.');
    } finally {
      if (mia === secuencia.current) setLoading(false);
    }
  }, [page, tab, filtroEstado, filtroModeracion, setPage]);

  // Contador de la pestaña "Pendientes": total de la misma consulta paginada.
  const cargarConteo = useCallback(async () => {
    try {
      const res = await adminService.getTodasOfertas({ estadoModeracion: 'pendiente', page: 1, limit: 1 });
      setConteoPend(res.data?.pagination?.total ?? 0);
    } catch {
      setConteoPend(null);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { cargarConteo(); }, [cargarConteo]);

  const ejecutarAccion = async (oferta, accion) => {
    setAccionando(oferta.id);
    setError('');
    try {
      await adminService.moderarOferta(oferta.id, accion);
      showToast(`Oferta ${RESULTADO_ACCION[accion]} correctamente.`, 'success');
      await Promise.all([cargar(), cargarConteo()]);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al moderar la oferta.');
    } finally {
      setAccionando(null);
    }
  };

  // Rechazar y Cerrar son irreversibles (no hay transición de salida en el backend):
  // piden confirmación. Aprobar y Pausar se ejecutan directo (se pueden revertir).
  const solicitarAccion = (oferta, accion) => {
    if (ACCIONES_CON_CONFIRMACION[accion]) setConfirmar({ oferta, accion });
    else ejecutarAccion(oferta, accion);
  };

  const confirmarAccion = async () => {
    const { oferta, accion } = confirmar;
    setConfirmar(null);
    await ejecutarAccion(oferta, accion);
  };

  const hayFiltros = tab === 'todas' && Boolean(filtroEstado || filtroModeracion);
  const total = pagination?.total ?? ofertas.length;
  const plural = total !== 1;
  const textoResultados = tab === 'pendientes'
    ? `${total} oferta${plural ? 's' : ''} pendiente${plural ? 's' : ''} de revisión`
    : `${total} oferta${plural ? 's' : ''} encontrada${plural ? 's' : ''}`;
  const mostrarModeracion = tab === 'todas';
  const primeraCarga = loading && ofertas.length === 0 && !error;

  const listado = ofertas.length > 0 && (
    <div className={loading ? styles.recargando : undefined} aria-busy={loading}>
      {esTabla ? (
        <TableResponsive minWidth={mostrarModeracion ? 820 : 720}>
          <thead>
            <tr>
              <th>Oferta</th>
              <th>Área / Modalidad</th>
              <th>Estado</th>
              {mostrarModeracion && <th>Moderación</th>}
              <th>Publicada</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ofertas.map((o) => (
              <tr key={o.id}>
                <td className="cell-break">
                  <strong>{o.titulo}</strong>
                  <small className={styles.sub}>{o.empresa?.razonSocial ?? '—'}</small>
                </td>
                <td className="cell-break">
                  {o.area ?? '—'}
                  {o.modalidad && <small className={styles.sub}>{o.modalidad}</small>}
                </td>
                <td><EstadoBadge estado={o.estado} /></td>
                {mostrarModeracion && <td><ModeracionBadge estado={o.estadoModeracion} /></td>}
                <td className={styles.fecha}>{fechaCorta(o)}</td>
                <td>
                  <AccionesOferta oferta={o} ocupado={accionando === o.id} onAccion={solicitarAccion} />
                </td>
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
              subtitle={o.empresa?.razonSocial ?? undefined}
              badge={<EstadoBadge estado={o.estado} />}
              fields={[
                { label: 'Área', value: o.area },
                { label: 'Modalidad', value: o.modalidad },
                { label: 'Moderación', value: mostrarModeracion ? <ModeracionBadge estado={o.estadoModeracion} /> : null },
                { label: 'Publicada', value: fechaCorta(o) },
              ]}
              actions={<AccionesOferta oferta={o} ocupado={accionando === o.id} onAccion={solicitarAccion} />}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="page-container">
      <Toast toast={toast} />

      <PageHeader
        title="Moderación de ofertas"
        subtitle="Revisá las ofertas publicadas por las empresas y gestioná su estado."
      />

      {error && <p className={`error-msg ${styles.error}`} role="alert">{error}</p>}

      <Tabs
        idPrefix="ofe"
        ariaLabel="Ofertas"
        stretch
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'pendientes', label: 'Pendientes', icon: 'clock', count: conteoPend, alerta: true },
          { key: 'todas', label: 'Todas', icon: 'list' },
        ]}
      />

      <TabPanel idPrefix="ofe" tabKey={tab}>
        {tab === 'todas' && (
          <div className={styles.filtros}>
            <FilterGroup label="Estado" idPrefix="filtro-estado" options={OPCIONES_ESTADO} value={filtroEstado} onChange={setFiltroEstado} />
            <FilterGroup label="Moderación" idPrefix="filtro-moderacion" options={OPCIONES_MODERACION} value={filtroModeracion} onChange={setFiltroModeracion} />
          </div>
        )}

        <p className={styles.resultados} role="status" aria-live="polite">
          {loading ? 'Cargando…' : textoResultados}
        </p>

        {primeraCarga ? (
          <p className="msg" role="status">Cargando ofertas...</p>
        ) : ofertas.length === 0 && !error ? (
          <EmptyState
            iconName={tab === 'pendientes' ? 'checkCircle' : 'briefcase'}
            title={tab === 'pendientes' ? 'No hay ofertas pendientes de moderación.' : 'No hay ofertas para los filtros seleccionados.'}
            hint={tab === 'pendientes' ? 'Cuando una empresa estándar publique una oferta, va a aparecer acá.' : undefined}
          >
            {hayFiltros && (
              <button type="button" className="btn-secondary" onClick={() => { setFiltroEstado(''); setFiltroModeracion(''); }}>
                Limpiar filtros
              </button>
            )}
          </EmptyState>
        ) : listado}

        {!primeraCarga && <Paginacion pagination={pagination} onPageChange={setPage} />}
      </TabPanel>

      {confirmar && (
        <ConfirmModal
          title={ACCIONES_CON_CONFIRMACION[confirmar.accion].titulo}
          confirmLabel={ACCIONES_CON_CONFIRMACION[confirmar.accion].confirmar}
          tone={confirmar.accion === 'rechazar' ? 'danger' : 'warn'}
          onConfirm={confirmarAccion}
          onClose={() => setConfirmar(null)}
          confirmId="btn-confirmar-accion-oferta"
        >
          <p>
            Oferta: <strong>{confirmar.oferta.titulo}</strong>
            {confirmar.oferta.empresa?.razonSocial && <> · {confirmar.oferta.empresa.razonSocial}</>}
          </p>
          <p>{ACCIONES_CON_CONFIRMACION[confirmar.accion].detalle}</p>
        </ConfirmModal>
      )}
    </div>
  );
}
