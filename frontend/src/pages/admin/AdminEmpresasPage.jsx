/**
 * AdminEmpresasPage.jsx — Listado general de empresas + nivel de confianza
 * institucional.
 *
 * Política "empresa estándar vs. empresa de confianza" (RBAC-05): una
 * empresa confiable agrega reclutadores y publica ofertas sin moderación
 * previa del admin — moderación posterior: el admin sigue pudiendo revisar,
 * pausar, rechazar o cerrar cualquier publicación después, y revocar la
 * confianza en cualquier momento sin afectar retroactivamente lo ya
 * publicado (solo rige para operaciones nuevas). Cambiar la confianza pide
 * confirmación explícita en un modal que explica el alcance.
 *
 * Búsqueda (razón social, CUIT o responsable) y filtros se resuelven en el
 * servidor antes de paginar: el total y las páginas son los de los resultados.
 *
 * No gestiona la aprobación inicial de una empresa nueva — eso sigue siendo
 * AdminSolicitudesPage.jsx (vía SolicitudEmpresa). Esta pantalla es el
 * listado general de las empresas que ya existen en el sistema.
 *
 * Ruta: /admin/empresas
 * Rol: admin
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { adminService } from '../../services/admin.service';
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
import ConfirmModal from '../../components/ui/ConfirmModal';
import Toast from '../../components/ui/Toast';
import Icon from '../../components/ui/Icon';
import Paginacion from '../../components/Paginacion/Paginacion';
import styles from './AdminEmpresasPage.module.css';
import { formatearCuitParaVista } from '../../utils/formatos';

// Tonos de badge (clases globales .badge-tone-*): el texto siempre acompaña al color.
const ESTADO_TONO = {
  pendiente: 'blue',
  aprobada:  'green',
  rechazada: 'red',
};
const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  aprobada:  'Aprobada',
  rechazada: 'Rechazada',
};
const OPCIONES_ESTADO = [
  { value: '', label: 'Todas' },
  ...Object.entries(ESTADO_LABEL).map(([value, label]) => ({ value, label })),
];

const CONFIANZA_TONO = { estandar: 'gray', confiable: 'teal' };
const CONFIANZA_LABEL = { estandar: 'Estándar', confiable: 'Confiable' };
const OPCIONES_CONFIANZA = [
  { value: '', label: 'Todas' },
  ...Object.entries(CONFIANZA_LABEL).map(([value, label]) => ({ value, label })),
];

const fechaAlta = (e) => (e.createdAt ? new Date(e.createdAt).toLocaleDateString('es-AR') : '—');
const nombreResponsable = (e) => (e.usuario ? `${e.usuario.nombre} ${e.usuario.apellido}` : '—');

function EstadoBadge({ estado }) {
  return (
    <span className={`badge badge-tone-${ESTADO_TONO[estado] ?? 'gray'}`}>
      {ESTADO_LABEL[estado] ?? estado}
    </span>
  );
}

function ConfianzaBadge({ nivel }) {
  return (
    <span className={`badge badge-tone-${CONFIANZA_TONO[nivel] ?? 'gray'}`}>
      {nivel === 'confiable' && <Icon name="shield" size={14} strokeWidth={2} />}
      {CONFIANZA_LABEL[nivel] ?? nivel}
    </span>
  );
}

export default function AdminEmpresasPage() {
  const esTabla = useMediaQuery('(min-width: 1024px)');
  const { toast, showToast } = useToast(5000);

  const [empresas,   setEmpresas]   = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  const [texto,          setTexto]          = useState('');
  const [filtroEstado,   setFiltroEstado]   = useState('');
  const [filtroConfianza, setFiltroConfianza] = useState('');
  const q = useDebouncedValue(texto.trim(), 350);
  const { page, setPage } = usePaginacion([q, filtroEstado, filtroConfianza]);

  const [confirmar, setConfirmar] = useState(null); // { empresa, accion: 'marcar' | 'revocar' }
  const [guardando, setGuardando] = useState(false);

  // Descarta respuestas de consultas viejas (buscador escribiendo rápido).
  const secuencia = useRef(0);

  const cargar = useCallback(async () => {
    const mia = ++secuencia.current;
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 25 };
      if (filtroEstado)    params.estadoAprobacion = filtroEstado;
      if (filtroConfianza) params.nivelConfianza   = filtroConfianza;
      if (q)               params.q                = q;
      const res = await adminService.getEmpresas(params);
      if (mia !== secuencia.current) return;
      setEmpresas(res.data?.data ?? []);
      setPagination(res.data?.pagination ?? null);
    } catch {
      if (mia !== secuencia.current) return;
      setError('No se pudieron cargar las empresas.');
    } finally {
      if (mia === secuencia.current) setLoading(false);
    }
  }, [page, filtroEstado, filtroConfianza, q]);

  useEffect(() => { cargar(); }, [cargar]);

  const hayFiltros = Boolean(q || filtroEstado || filtroConfianza);
  const limpiarFiltros = () => {
    setTexto('');
    setFiltroEstado('');
    setFiltroConfianza('');
  };

  const aplicarConfianza = async () => {
    const { empresa, accion } = confirmar;
    setGuardando(true);
    try {
      await adminService.cambiarConfianzaEmpresa(empresa.id, accion);
      showToast(
        accion === 'marcar'
          ? `"${empresa.razonSocial}" ahora es una empresa de confianza.`
          : `Se revocó la confianza institucional de "${empresa.razonSocial}".`,
        'success',
      );
      setConfirmar(null);
      cargar();
    } catch (err) {
      setConfirmar(null);
      setError(err.response?.data?.message ?? 'No se pudo cambiar el nivel de confianza.');
    } finally {
      setGuardando(false);
    }
  };

  const botonConfianza = (e, extra = '') => {
    const confiable = e.nivelConfianza === 'confiable';
    return (
      <button
        type="button"
        className={`${confiable ? 'btn-warn' : 'btn-ok'} ${extra}`.trim()}
        onClick={() => setConfirmar({ empresa: e, accion: confiable ? 'revocar' : 'marcar' })}
        aria-label={`${confiable ? 'Revocar confianza de' : 'Marcar como confiable a'} ${e.razonSocial}`}
      >
        <Icon name={confiable ? 'close' : 'shield'} size={16} />
        {confiable ? 'Revocar confianza' : 'Marcar confiable'}
      </button>
    );
  };

  const total = pagination?.total ?? empresas.length;
  const primeraCarga = loading && empresas.length === 0 && !error;

  return (
    <div className="page-container">
      <Toast toast={toast} />

      <PageHeader
        title="Empresas"
        subtitle="Empresas registradas y su nivel de confianza institucional."
      />

      {error && <p className={`error-msg ${styles.error}`} role="alert">{error}</p>}

      <div className={styles.toolbar}>
        <div className={styles.busqueda}>
          <SearchField
            id="busqueda-empresa"
            label="Buscar empresas"
            placeholder="Buscar por empresa, CUIT o responsable…"
            value={texto}
            onChange={setTexto}
          />
        </div>
        <div className={styles.grupos}>
          <FilterGroup label="Estado" idPrefix="filtro-estado" options={OPCIONES_ESTADO} value={filtroEstado} onChange={setFiltroEstado} />
          <FilterGroup label="Confianza" idPrefix="filtro-confianza" options={OPCIONES_CONFIANZA} value={filtroConfianza} onChange={setFiltroConfianza} />
        </div>
      </div>

      <p className={styles.resultados} role="status" aria-live="polite">
        {loading ? 'Buscando…' : `${total} empresa${total !== 1 ? 's' : ''} encontrada${total !== 1 ? 's' : ''}`}
      </p>

      {primeraCarga ? (
        <p className="msg" role="status">Cargando empresas...</p>
      ) : empresas.length === 0 && !error ? (
        <EmptyState
          iconName="building"
          title={hayFiltros ? 'No se encontraron empresas con esos criterios.' : 'Todavía no hay empresas registradas.'}
          hint={hayFiltros ? 'Probá con otro texto o quitá algún filtro.' : undefined}
        >
          {hayFiltros && (
            <button type="button" className="btn-secondary" onClick={limpiarFiltros}>Limpiar filtros</button>
          )}
        </EmptyState>
      ) : empresas.length > 0 && (
        <div className={loading ? styles.recargando : undefined} aria-busy={loading}>
          {esTabla ? (
            <TableResponsive minWidth={860}>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>CUIT</th>
                  <th>Responsable</th>
                  <th>Estado</th>
                  <th>Confianza</th>
                  <th>Alta</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {empresas.map((e) => (
                  <tr key={e.id}>
                    <td className="cell-break"><strong>{e.razonSocial}</strong></td>
                    <td className={styles.cuit}>{formatearCuitParaVista(e.cuit) || '—'}</td>
                    <td className="cell-break">
                      {nombreResponsable(e)}
                      {e.usuario?.email && <small className={styles.sub}>{e.usuario.email}</small>}
                    </td>
                    <td><EstadoBadge estado={e.estadoAprobacion} /></td>
                    <td><ConfianzaBadge nivel={e.nivelConfianza} /></td>
                    <td className={styles.fecha}>{fechaAlta(e)}</td>
                    <td>{botonConfianza(e)}</td>
                  </tr>
                ))}
              </tbody>
            </TableResponsive>
          ) : (
            <div className={styles.cards}>
              {empresas.map((e) => (
                <DataCard
                  key={e.id}
                  title={e.razonSocial}
                  subtitle={e.cuit ? `CUIT ${formatearCuitParaVista(e.cuit)}` : undefined}
                  badge={<EstadoBadge estado={e.estadoAprobacion} />}
                  fields={[
                    { label: 'Responsable', value: e.usuario ? `${nombreResponsable(e)} · ${e.usuario.email}` : null },
                    { label: 'Confianza', value: <ConfianzaBadge nivel={e.nivelConfianza} /> },
                    { label: 'Alta', value: fechaAlta(e) },
                  ]}
                  actions={botonConfianza(e)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {!primeraCarga && <Paginacion pagination={pagination} onPageChange={setPage} />}

      {confirmar && (
        <ConfirmModal
          title={confirmar.accion === 'marcar' ? 'Marcar empresa como confiable' : 'Revocar confianza institucional'}
          confirmLabel={confirmar.accion === 'marcar' ? 'Marcar como confiable' : 'Revocar confianza'}
          tone={confirmar.accion === 'marcar' ? 'ok' : 'warn'}
          busy={guardando}
          onConfirm={aplicarConfianza}
          onClose={() => setConfirmar(null)}
          confirmId="btn-confirmar-confianza"
        >
          <p>Empresa: <strong>{confirmar.empresa.razonSocial}</strong></p>
          {confirmar.accion === 'marcar' ? (
            <p>
              Las nuevas ofertas de esta empresa podrán publicarse automáticamente y sus altas de
              reclutadores no requerirán aprobación previa. El administrador podrá seguir moderando o
              revocando esta confianza posteriormente.
            </p>
          ) : (
            <p>
              Las nuevas ofertas y altas de reclutadores de esta empresa volverán a requerir aprobación
              del administrador. Las publicaciones y reclutadores ya aprobados no se modifican.
            </p>
          )}
        </ConfirmModal>
      )}
    </div>
  );
}
