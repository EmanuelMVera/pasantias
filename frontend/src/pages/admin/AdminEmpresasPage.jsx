/**
 * AdminEmpresasPage.jsx — Listado general de empresas + nivel de confianza
 * institucional.
 *
 * Política "empresa estándar vs. empresa de confianza" (RBAC-05): una
 * empresa confiable agrega reclutadores y publica ofertas sin moderación
 * previa del admin — moderación posterior: el admin sigue pudiendo revisar,
 * pausar, rechazar o cerrar cualquier publicación después, y revocar la
 * confianza en cualquier momento sin afectar retroactivamente lo ya
 * publicado (solo rige para operaciones nuevas).
 *
 * No gestiona la aprobación inicial de una empresa nueva — eso sigue siendo
 * AdminSolicitudesPage.jsx (vía SolicitudEmpresa). Esta pantalla es el
 * listado general de las empresas que ya existen en el sistema.
 *
 * Ruta: /admin/empresas
 * Rol: admin
 */

import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../services/admin.service';
import Paginacion from '../../components/Paginacion/Paginacion';
import TableResponsive from '../../components/ui/TableResponsive';
import styles from './AdminEmpresasPage.module.css';

const ESTADO_COLOR = {
  pendiente: '#3498db',
  aprobada:  '#27ae60',
  rechazada: '#e74c3c',
};
const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  aprobada:  'Aprobada',
  rechazada: 'Rechazada',
};
const FILTROS_ESTADO = ['todas', 'pendiente', 'aprobada', 'rechazada'];

const CONFIANZA_COLOR = { estandar: '#7f8c8d', confiable: '#16a085' };
const CONFIANZA_LABEL = { estandar: 'Estándar', confiable: '🤝 Confiable' };
const FILTROS_CONFIANZA = ['todas', 'estandar', 'confiable'];

export default function AdminEmpresasPage() {
  const [empresas,        setEmpresas]        = useState([]);
  const [pagination,      setPagination]      = useState(null);
  const [page,            setPage]            = useState(1);
  const [filtroEstado,    setFiltroEstado]    = useState('todas');
  const [filtroConfianza, setFiltroConfianza] = useState('todas');
  const [loading,         setLoading]         = useState(true);
  const [accionando,      setAccionando]      = useState(null);
  const [confirmando,     setConfirmando]     = useState(null); // id en confirmación inline
  const [error,           setError]           = useState('');
  const [mensaje,         setMensaje]         = useState('');

  const cargar = useCallback(async (estado, nivelConfianza, pagina = 1) => {
    setLoading(true);
    try {
      const params = { page: pagina, limit: 25 };
      if (estado && estado !== 'todas') params.estadoAprobacion = estado;
      if (nivelConfianza && nivelConfianza !== 'todas') params.nivelConfianza = nivelConfianza;
      const res = await adminService.getEmpresas(params);
      setEmpresas(res.data?.data ?? []);
      setPagination(res.data?.pagination ?? null);
      setPage(pagina);
    } catch {
      setError('Error al cargar las empresas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(filtroEstado, filtroConfianza, 1); }, [filtroEstado, filtroConfianza, cargar]);

  const handleCambiarConfianza = async (empresa) => {
    const accion = empresa.nivelConfianza === 'confiable' ? 'revocar' : 'marcar';
    setAccionando(empresa.id);
    setConfirmando(null);
    setError('');
    setMensaje('');
    try {
      await adminService.cambiarConfianzaEmpresa(empresa.id, accion);
      setMensaje(accion === 'marcar'
        ? `"${empresa.razonSocial}" ahora es una empresa de confianza.`
        : `Se revocó la confianza institucional de "${empresa.razonSocial}".`);
      cargar(filtroEstado, filtroConfianza, page);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cambiar el nivel de confianza.');
    } finally {
      setAccionando(null);
    }
  };

  return (
    <div className="page-container">

      <div className="dashboard-header">
        <h1>Empresas</h1>
      </div>

      {error   && <p className={`error-msg ${styles.feedback}`}>⚠️ {error}</p>}
      {mensaje && <p className={`success-msg ${styles.feedback}`}>✅ {mensaje}</p>}

      <div className={styles.filtrosWrap}>
        <div className={styles.filtros}>
          {FILTROS_ESTADO.map((f) => {
            const activo = filtroEstado === f;
            const color = ESTADO_COLOR[f] ?? 'var(--primary)';
            return (
              <button
                key={f}
                onClick={() => setFiltroEstado(f)}
                className={`${styles.filtro} ${activo ? styles.filtroActivo : ''}`}
                style={activo ? { background: color, borderColor: color } : undefined}
                aria-pressed={activo}
              >
                {f === 'todas' ? 'Todas' : ESTADO_LABEL[f]}
              </button>
            );
          })}
        </div>
        <div className={styles.filtros}>
          {FILTROS_CONFIANZA.map((f) => {
            const activo = filtroConfianza === f;
            const color = CONFIANZA_COLOR[f] ?? 'var(--primary)';
            return (
              <button
                key={f}
                onClick={() => setFiltroConfianza(f)}
                className={`${styles.filtro} ${activo ? styles.filtroActivo : ''}`}
                style={activo ? { background: color, borderColor: color } : undefined}
                aria-pressed={activo}
              >
                {f === 'todas' ? 'Toda confianza' : CONFIANZA_LABEL[f]}
              </button>
            );
          })}
        </div>
        <span className={styles.count}>
          {loading ? '...' : `${pagination?.total ?? empresas.length} resultado${(pagination?.total ?? empresas.length) !== 1 ? 's' : ''}`}
        </span>
      </div>

      {loading ? (
        <p className="msg">Cargando...</p>
      ) : empresas.length === 0 ? (
        <div className={styles.emptyBox}>No hay empresas para el filtro seleccionado.</div>
      ) : (
        <TableResponsive minWidth={860}>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>CUIT</th>
                <th>Responsable</th>
                <th>Estado</th>
                <th>Confianza</th>
                <th>Alta</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map((e) => (
                <tr key={e.id} className={accionando === e.id ? styles.rowBusy : ''}>
                  <td><strong>{e.razonSocial}</strong></td>
                  <td>{e.cuit ?? '—'}</td>
                  <td>
                    {e.usuario ? `${e.usuario.nombre} ${e.usuario.apellido}` : '—'}
                    {e.usuario?.email && (
                      <>
                        <br />
                        <small className={styles.emailSmall}>{e.usuario.email}</small>
                      </>
                    )}
                  </td>
                  <td>
                    <span className="badge" style={{ background: ESTADO_COLOR[e.estadoAprobacion] ?? '#7f8c8d' }}>
                      {ESTADO_LABEL[e.estadoAprobacion] ?? e.estadoAprobacion}
                    </span>
                  </td>
                  <td>
                    <span className="badge" style={{ background: CONFIANZA_COLOR[e.nivelConfianza] ?? '#7f8c8d' }}>
                      {CONFIANZA_LABEL[e.nivelConfianza] ?? e.nivelConfianza}
                    </span>
                  </td>
                  <td className={styles.fechaCell}>
                    {e.createdAt ? new Date(e.createdAt).toLocaleDateString('es-AR') : '—'}
                  </td>
                  <td>
                    {accionando === e.id ? (
                      <span className={styles.procesando}>Procesando...</span>
                    ) : confirmando === e.id ? (
                      <div className={styles.acciones}>
                        <span className={styles.confirmarTexto}>¿Confirmar?</span>
                        <button className="btn-ok" onClick={() => handleCambiarConfianza(e)}>Sí</button>
                        <button className="btn-secondary" onClick={() => setConfirmando(null)}>No</button>
                      </div>
                    ) : (
                      <button
                        className={e.nivelConfianza === 'confiable' ? 'btn-warn' : 'btn-ok'}
                        onClick={() => setConfirmando(e.id)}
                      >
                        {e.nivelConfianza === 'confiable' ? '↩️ Revocar confianza' : '🤝 Marcar confiable'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
        </TableResponsive>
      )}

      {!loading && (
        <Paginacion pagination={pagination} onPageChange={(p) => cargar(filtroEstado, filtroConfianza, p)} />
      )}
    </div>
  );
}
