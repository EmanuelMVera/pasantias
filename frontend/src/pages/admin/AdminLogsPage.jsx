/**
 * AdminLogsPage.jsx — Auditoría del sistema (visor de activity_logs).
 *
 * Filtros por acción, entidad y rango de fechas con dos estados separados:
 *   - EDITADOS (`borrador`): lo que la persona está tocando en el formulario.
 *   - APLICADOS (`filtros`): lo que realmente se consultó. Solo cambian con
 *     "Aplicar filtros" (o "Limpiar"). La tabla, el contador y la EXPORTACIÓN
 *     usan siempre los aplicados, así lo exportado coincide con lo que se ve.
 *
 * Tabla compacta en escritorio (sin columna de ID) y cards en tablet/móvil.
 * Paginación de 25 registros por página.
 *
 * Ruta: /admin/logs
 * Rol: admin
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { adminService } from '../../services/admin.service';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useToast } from '../../hooks/useToast';
import Paginacion from '../../components/Paginacion/Paginacion';
import { BrandMark } from '../../components/Brand/Brand';
import Icon from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import ExportMenu from '../../components/ui/ExportMenu';
import TableResponsive from '../../components/ui/TableResponsive';
import DataCard from '../../components/ui/DataCard';
import EmptyState from '../../components/ui/EmptyState';
import Toast from '../../components/ui/Toast';
import { descargarBlob, nombreDesdeContentDisposition } from '../../utils/csv';
import { OPCIONES_ACCION, OPCIONES_ENTIDAD, accionInfo, entidadLabel } from './auditoria.utils';
import styles from './AdminLogsPage.module.css';

const FILTROS_VACIOS = { accion: '', entidad: '', desde: '', hasta: '' };

const soloFecha = (iso) => new Date(iso).toLocaleDateString('es-AR');
const soloHora = (iso) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// Solo manda al backend los filtros con valor.
const paramsDe = (f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v));

function AccionBadge({ accion }) {
  const { label, color } = accionInfo(accion);
  return <span className={styles.accionBadge} style={{ '--badge-color': color }}>{label}</span>;
}

function UsuarioCelda({ usuario }) {
  if (!usuario) return <span className={styles.sistema}>Sistema</span>;
  return (
    <div className={styles.userCell}>
      {usuario.rol === 'admin'
        ? <BrandMark size={32} className={styles.avatarLogo} />
        : <span className={styles.avatar} aria-hidden="true">{usuario.nombre?.[0]}{usuario.apellido?.[0]}</span>}
      <div>
        <span>{usuario.nombre} {usuario.apellido}</span>
        <small className={styles.email}>{usuario.email}</small>
      </div>
    </div>
  );
}

const entidadTexto = (log) => (log.entidad ? `${entidadLabel(log.entidad)}${log.entidadId ? ` #${log.entidadId}` : ''}` : null);

export default function AdminLogsPage() {
  const esTabla = useMediaQuery('(min-width: 1024px)');
  const { toast, showToast } = useToast(5000);

  const [logs,       setLogs]       = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  const [borrador, setBorrador] = useState(FILTROS_VACIOS); // editados (formulario)
  const [filtros,  setFiltros]  = useState(FILTROS_VACIOS); // aplicados (consulta + export)
  const [page,     setPage]     = useState(1);
  const [errorFiltros, setErrorFiltros] = useState('');

  const secuencia = useRef(0);

  const cargar = useCallback(async () => {
    const mia = ++secuencia.current;
    setLoading(true);
    setError('');
    try {
      const res = await adminService.getLogs({ page, limit: 25, ...paramsDe(filtros) });
      if (mia !== secuencia.current) return;
      setLogs(res.data.data ?? []);
      setPagination(res.data.pagination ?? null);
    } catch {
      if (mia !== secuencia.current) return;
      setError('No se pudieron cargar los registros de auditoría.');
    } finally {
      if (mia === secuencia.current) setLoading(false);
    }
  }, [page, filtros]);

  useEffect(() => { cargar(); }, [cargar]);

  const hayCambiosSinAplicar = Object.keys(FILTROS_VACIOS).some((k) => borrador[k] !== filtros[k]);
  const hayFiltrosAplicados = Object.values(filtros).some(Boolean);

  const setCampo = (campo) => (e) => {
    setBorrador((b) => ({ ...b, [campo]: e.target.value }));
    setErrorFiltros('');
  };

  const aplicar = (e) => {
    e.preventDefault();
    if (borrador.desde && borrador.hasta && borrador.desde > borrador.hasta) {
      setErrorFiltros('La fecha "Desde" no puede ser posterior a "Hasta".');
      return;
    }
    setErrorFiltros('');
    setFiltros(borrador);
    setPage(1);
  };

  const limpiar = () => {
    setBorrador(FILTROS_VACIOS);
    setFiltros(FILTROS_VACIOS);
    setErrorFiltros('');
    setPage(1);
  };

  // La exportación usa los filtros APLICADOS, no los que se están editando.
  const handleExport = async (format) => {
    try {
      const res = await adminService.exportarLogs({ format, ...paramsDe(filtros) });
      const fallback = `auditoria-${new Date().toISOString().slice(0, 10)}.${format}`;
      const nombre = nombreDesdeContentDisposition(res.headers['content-disposition'], fallback);
      descargarBlob(res.data, nombre);
      showToast(`Exportación ${format.toUpperCase()} generada.`, 'success');
    } catch {
      showToast('No se pudo exportar la auditoría.', 'error');
    }
  };

  const total = pagination?.total ?? 0;
  const primeraCarga = loading && logs.length === 0 && !error;

  return (
    <div className="page-container">
      <Toast toast={toast} />

      <PageHeader
        title="Auditoría del sistema"
        subtitle={loading && !pagination ? 'Cargando…' : `${total} registro${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`}
        actions={<ExportMenu id="btn-exportar-logs" formats={['csv', 'xlsx', 'pdf']} onExport={handleExport} />}
      />

      {error && <p className={`error-msg ${styles.error}`} role="alert">{error}</p>}

      {/* noValidate: el rango inválido lo informa `errorFiltros` (accesible), no el globo nativo del navegador. */}
      <form className={styles.filtros} onSubmit={aplicar} aria-label="Filtros de auditoría" noValidate>
        <div className={styles.campo}>
          <label htmlFor="filtro-accion">Acción</label>
          <select id="filtro-accion" value={borrador.accion} onChange={setCampo('accion')}>
            <option value="">Todas las acciones</option>
            {OPCIONES_ACCION.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className={styles.campo}>
          <label htmlFor="filtro-entidad">Entidad</label>
          <select id="filtro-entidad" value={borrador.entidad} onChange={setCampo('entidad')}>
            <option value="">Todas las entidades</option>
            {OPCIONES_ENTIDAD.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className={styles.campo}>
          <label htmlFor="filtro-desde">Desde</label>
          <input
            id="filtro-desde" type="date" value={borrador.desde} max={borrador.hasta || undefined}
            onChange={setCampo('desde')} aria-invalid={Boolean(errorFiltros)}
            aria-describedby={errorFiltros ? 'error-filtros' : undefined}
          />
        </div>

        <div className={styles.campo}>
          <label htmlFor="filtro-hasta">Hasta</label>
          <input
            id="filtro-hasta" type="date" value={borrador.hasta} min={borrador.desde || undefined}
            onChange={setCampo('hasta')} aria-invalid={Boolean(errorFiltros)}
            aria-describedby={errorFiltros ? 'error-filtros' : undefined}
          />
        </div>

        <div className={styles.botones}>
          <button type="submit" id="btn-aplicar-filtros" className="btn-primary">
            <Icon name="filter" size={18} />
            Aplicar filtros
          </button>
          <button type="button" id="btn-limpiar-filtros" className="btn-secondary" onClick={limpiar}>Limpiar</button>
        </div>

        {errorFiltros && <p id="error-filtros" className={styles.errorFiltros} role="alert">{errorFiltros}</p>}
        {hayCambiosSinAplicar && !errorFiltros && (
          <p className={styles.pendiente} role="status">
            Cambiaste los filtros. Presioná “Aplicar filtros” para actualizar la lista y la exportación.
          </p>
        )}
      </form>

      {primeraCarga ? (
        <p className="msg" role="status">Cargando registros...</p>
      ) : logs.length === 0 && !error ? (
        <EmptyState
          iconName="history"
          title={hayFiltrosAplicados ? 'No hay registros con los filtros aplicados.' : 'Todavía no hay registros de auditoría.'}
        >
          {hayFiltrosAplicados && (
            <button type="button" className="btn-secondary" onClick={limpiar}>Limpiar filtros</button>
          )}
        </EmptyState>
      ) : logs.length > 0 && (
        <div className={loading ? styles.recargando : undefined} aria-busy={loading}>
          {esTabla ? (
            <TableResponsive minWidth={760}>
              <thead>
                <tr>
                  <th>Fecha / Hora</th>
                  <th>Acción</th>
                  <th>Entidad</th>
                  <th>Usuario</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className={styles.fechaCell}>
                      <span>{soloFecha(log.createdAt)}</span>
                      <small>{soloHora(log.createdAt)}</small>
                    </td>
                    <td><AccionBadge accion={log.accion} /></td>
                    <td>{entidadTexto(log) ?? '—'}</td>
                    <td className="cell-break"><UsuarioCelda usuario={log.usuario} /></td>
                    <td className={styles.ipCell}>{log.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </TableResponsive>
          ) : (
            <div className={styles.cards}>
              {logs.map((log) => (
                <DataCard
                  key={log.id}
                  title={accionInfo(log.accion).label}
                  subtitle={`${soloFecha(log.createdAt)} · ${soloHora(log.createdAt)}`}
                  fields={[
                    { label: 'Entidad', value: entidadTexto(log) },
                    { label: 'Usuario', value: log.usuario ? `${log.usuario.nombre} ${log.usuario.apellido} · ${log.usuario.email}` : 'Sistema' },
                    { label: 'IP', value: log.ip },
                  ]}
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
