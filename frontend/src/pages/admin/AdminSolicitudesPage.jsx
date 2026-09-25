/**
 * AdminSolicitudesPage.jsx — Gestión de solicitudes de registro de empresa.
 *
 * Permite al administrador:
 *  - Ver todas las solicitudes con filtro por estado
 *  - Ver el detalle completo de cada solicitud en un panel lateral
 *  - Aprobar (crea empresa + usuario + envía credenciales por email)
 *  - Rechazar (con motivo opcional + email de notificación)
 *
 * Ruta: /admin/solicitudes
 * Acceso: solo rol 'admin'
 *
 * Orquesta dos secciones independientes (solicitudes de empresa y de
 * reclutadores — nunca se cruzan, cada una con su propio estado/paginación)
 * delegadas a SolicitudesEmpresaSection/SolicitudesReclutadorSection.
 */

import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../services/admin.service';
import { ESTADO_CONFIG } from '../../components/EstadoSolicitudBadge/estadoSolicitud.utils';
import SolicitudesStatsRow from '../../components/SolicitudesStatsRow/SolicitudesStatsRow';
import RechazarSolicitudModal from '../../components/RechazarSolicitudModal/RechazarSolicitudModal';
import SolicitudesEmpresaSection from '../../components/SolicitudesEmpresaSection/SolicitudesEmpresaSection';
import SolicitudesReclutadorSection from '../../components/SolicitudesReclutadorSection/SolicitudesReclutadorSection';
import styles from './AdminSolicitudesPage.module.css';

const sumar = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

export default function AdminSolicitudesPage() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');
  const [filtroEstado, setFiltroEstado] = useState(''); // '' | 'pendiente' | 'aprobado' | 'rechazado'
  const [paginationEmp, setPaginationEmp] = useState(null);
  const [conteoEmp,     setConteoEmp]     = useState({});
  const [pageEmp,       setPageEmp]       = useState(1);

  // Panel de detalle / acción
  const [detalle,    setDetalle]    = useState(null); // solicitud seleccionada
  const [accionando, setAccionando] = useState(false);
  const [confirmando, setConfirmando] = useState(null); // id de solicitud en confirmación de aprobación

  // Modal de rechazo (para ingresar el motivo)
  const [modalRechazo, setModalRechazo] = useState(false);
  const [motivo,       setMotivo]       = useState('');

  // ── Estado: solicitudes de reclutadores (sección 2) ────────────────────────────────
  const [solicitudesRecl,    setSolicitudesRecl]    = useState([]);
  const [loadingRecl,        setLoadingRecl]        = useState(true);
  const [filtroRecl,         setFiltroRecl]         = useState('');
  const [paginationRecl,     setPaginationRecl]     = useState(null);
  const [conteoRecl,         setConteoRecl]         = useState({});
  const [pageRecl,           setPageRecl]           = useState(1);
  const [confirmandoRecl,    setConfirmandoRecl]    = useState(null);
  const [accionandoRecl,     setAccionandoRecl]     = useState(false);
  const [modalRechazoRecl,   setModalRechazoRecl]   = useState(false);
  const [detalleRecl,        setDetalleRecl]        = useState(null);
  const [motivoRecl,         setMotivoRecl]         = useState('');

  // ── Carga de datos ──────────────────────────────────────────────────
  const cargar = useCallback(async (pagina = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = { page: pagina, limit: 25 };
      if (filtroEstado) params.estado = filtroEstado;
      const res = await adminService.getSolicitudesEmpresa(params);
      setSolicitudes(res.data.data ?? []);
      setPaginationEmp(res.data.pagination ?? null);
      setConteoEmp(res.data.conteoPorEstado ?? {});
      setPageEmp(pagina);
    } catch {
      setError('No se pudieron cargar las solicitudes.');
    } finally {
      setLoading(false);
    }
  }, [filtroEstado]);

  const cargarRecl = useCallback(async (pagina = 1) => {
    setLoadingRecl(true);
    try {
      const params = { page: pagina, limit: 25 };
      if (filtroRecl) params.estado = filtroRecl;
      const res = await adminService.getSolicitudesReclutador(params);
      setSolicitudesRecl(res.data.data ?? []);
      setPaginationRecl(res.data.pagination ?? null);
      setConteoRecl(res.data.conteoPorEstado ?? {});
      setPageRecl(pagina);
    } catch {
      // falla silenciosa — la sección muestra vacío
    } finally {
      setLoadingRecl(false);
    }
  }, [filtroRecl]);

  useEffect(() => { cargar(1);     }, [cargar]);
  useEffect(() => { cargarRecl(1); }, [cargarRecl]);

  // ── Helpers de toast ────────────────────────────────────────────────────────
  const showSuccess = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 4000);
  };

  // ── Aprobar solicitud ───────────────────────────────────────────────────────
  const handleAprobar = async (solicitud) => {
    if (confirmando !== solicitud.id) {
      setConfirmando(solicitud.id);
      return;
    }
    setConfirmando(null);
    setAccionando(true);
    setError('');
    try {
      const res = await adminService.aprobarSolicitud(solicitud.id);
      const { data } = res.data;
      const emailDestino = solicitud.responsableEmail || solicitud.email;
      showSuccess(
        `✅ "${solicitud.razonSocial}" aprobada. Credenciales enviadas a ${emailDestino}` +
        (data?.passwordGenerada ? ` (pwd dev: ${data.passwordGenerada})` : '') +
        (data?.reclutadoresPendientes ? ` · ${data.reclutadoresPendientes} solicitud(es) de reclutador creadas.` : '')
      );
      setDetalle(null);
      cargar(pageEmp);
    } catch (err) {
      const msg = err.response?.data?.message ?? 'Error al aprobar la solicitud.';
      setError(msg);
    } finally {
      setAccionando(false);
    }
  };

  // ── Rechazar solicitud ──────────────────────────────────────────────────
  const abrirRechazo = (solicitud) => {
    setDetalle(solicitud);
    setMotivo('');
    setModalRechazo(true);
  };

  const handleRechazar = async () => {
    if (!detalle) return;
    setAccionando(true);
    try {
      await adminService.rechazarSolicitud(detalle.id, motivo.trim() || undefined);
      showSuccess(`❌ Solicitud de "${detalle.razonSocial}" rechazada. Notificación enviada.`);
      setModalRechazo(false);
      setDetalle(null);
      cargar(pageEmp);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al rechazar la solicitud.');
      setModalRechazo(false);
    } finally {
      setAccionando(false);
    }
  };

  // ── Handlers: solicitudes de reclutadores ──────────────────────────────────────
  const handleAprobarRecl = async (sol) => {
    if (confirmandoRecl !== sol.id) { setConfirmandoRecl(sol.id); return; }
    setConfirmandoRecl(null);
    setAccionandoRecl(true);
    try {
      const res = await adminService.aprobarSolicitudReclutador(sol.id);
      const { data } = res.data;
      showSuccess(
        `✅ Reclutador "${sol.nombre}" aprobado. Credenciales enviadas a ${sol.email}` +
        (data?.passwordGenerada ? ` (pwd dev: ${data.passwordGenerada})` : '')
      );
      cargarRecl(pageRecl);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al aprobar.');
    } finally {
      setAccionandoRecl(false);
    }
  };

  const abrirRechazoRecl = (sol) => {
    setDetalleRecl(sol);
    setMotivoRecl('');
    setModalRechazoRecl(true);
  };

  const handleRechazarRecl = async () => {
    if (!detalleRecl) return;
    setAccionandoRecl(true);
    try {
      await adminService.rechazarSolicitudReclutador(detalleRecl.id, motivoRecl.trim() || undefined);
      showSuccess(`❌ Solicitud de "${detalleRecl.nombre}" rechazada. Notificación enviada a la empresa.`);
      setModalRechazoRecl(false);
      setDetalleRecl(null);
      cargarRecl(pageRecl);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al rechazar.');
      setModalRechazoRecl(false);
    } finally {
      setAccionandoRecl(false);
    }
  };

  // ── Estadísticas rápidas (del sidecar conteoPorEstado, sobre TODO el set) ──
  const stats = {
    total:     sumar(conteoEmp),
    pendiente: conteoEmp.pendiente ?? 0,
    aprobado:  conteoEmp.aprobado  ?? 0,
    rechazado: conteoEmp.rechazado ?? 0,
  };
  const statsRecl = {
    total:     sumar(conteoRecl),
    pendiente: conteoRecl.pendiente ?? 0,
    aprobado:  conteoRecl.aprobado  ?? 0,
    rechazado: conteoRecl.rechazado ?? 0,
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page-container">

      {/* ── Cabecera ── */}
      <div className="dashboard-header">
        <div>
          <h1>📋 Solicitudes de Empresa</h1>
          <p className={styles.subtitle}>
            Revisá, aprobá o rechazá las solicitudes de registro de nuevas empresas.
          </p>
        </div>
        <button className="btn-secondary" onClick={cargar} disabled={loading}>
          ↺ Actualizar
        </button>
      </div>

      {/* ── Mensajes ── */}
      {error   && <p className="error-msg" style={{ marginBottom: '1rem' }}>{error}</p>}
      {success && <div className={styles.successToast}>{success}</div>}

      {/* ── Tarjetas de resumen ── */}
      <SolicitudesStatsRow items={[
        { label: 'Total',     value: stats.total,     color: '#0073AD' },
        { label: 'Pendientes', value: stats.pendiente, color: '#e67e22' },
        { label: 'Aprobadas', value: stats.aprobado,  color: '#27ae60' },
        { label: 'Rechazadas', value: stats.rechazado, color: '#c0392b' },
      ]} />

      {/* ── Filtros ── */}
      <div className={styles.filtros}>
        <span className={styles.filtroLabel}>Filtrar por estado:</span>
        {['', 'pendiente', 'aprobado', 'rechazado'].map(est => (
          <button
            key={est}
            id={`filtro-${est || 'todos'}`}
            className={`${styles.filtroBtn} ${filtroEstado === est ? styles.filtroBtnActive : ''}`}
            onClick={() => setFiltroEstado(est)}
          >
            {est === '' ? 'Todos' : ESTADO_CONFIG[est]?.label}
          </button>
        ))}
      </div>

      <SolicitudesEmpresaSection
        solicitudes={solicitudes}
        loading={loading}
        filtroEstado={filtroEstado}
        detalle={detalle}
        onSelectDetalle={setDetalle}
        onCerrarDetalle={() => setDetalle(null)}
        confirmando={confirmando}
        onCancelarConfirmacion={() => setConfirmando(null)}
        accionando={accionando}
        onAprobar={handleAprobar}
        onAbrirRechazo={abrirRechazo}
        paginationEmp={paginationEmp}
        onPageChange={cargar}
      />

      {/* ── Modal de rechazo (empresas) ── */}
      {modalRechazo && detalle && (
        <RechazarSolicitudModal
          titulo="❌ Rechazar solicitud"
          motivo={motivo}
          onMotivoChange={setMotivo}
          motivoInputId="motivo-rechazo"
          motivoLabel="Motivo del rechazo"
          motivoPlaceholder="Explicá brevemente por qué se rechaza la solicitud."
          rows={4}
          accionando={accionando}
          onClose={() => setModalRechazo(false)}
          onConfirm={handleRechazar}
          confirmButtonId="btn-confirmar-rechazo"
        >
          Vas a rechazar la solicitud de <strong>{detalle.razonSocial}</strong>.
          Se enviará un email de notificación a{' '}
          <strong>{detalle.responsableEmail || detalle.email}</strong>.
        </RechazarSolicitudModal>
      )}

      {/* ──────────────────────────────────────────────── */}
      {/* ── SECCIÓN 2: Solicitudes de Reclutadores ── */}
      {/* ──────────────────────────────────────────────── */}
      <div style={{ marginTop: '3rem' }}>
        <div className="dashboard-header" style={{ marginBottom: '1.25rem' }}>
          <div>
            <h2>👤 Solicitudes de Reclutadores</h2>
            <p className={styles.subtitle}>
              Alta de reclutadores solicitada por empresas ya registradas.
            </p>
          </div>
          <button className="btn-secondary" onClick={cargarRecl} disabled={loadingRecl}>↺ Actualizar</button>
        </div>

        {/* Stats reclutadores */}
        <SolicitudesStatsRow style={{ marginBottom: '1rem' }} items={[
          { label: 'Total',      value: statsRecl.total,     color: '#0073AD' },
          { label: 'Pendientes', value: statsRecl.pendiente, color: '#e67e22' },
          { label: 'Aprobados',  value: statsRecl.aprobado,  color: '#27ae60' },
          { label: 'Rechazados', value: statsRecl.rechazado, color: '#c0392b' },
        ]} />

        {/* Filtros reclutadores */}
        <div className={styles.filtros} style={{ marginBottom: '1rem' }}>
          <span className={styles.filtroLabel}>Filtrar:</span>
          {['', 'pendiente', 'aprobado', 'rechazado'].map(est => (
            <button
              key={est}
              className={`${styles.filtroBtn} ${filtroRecl === est ? styles.filtroBtnActive : ''}`}
              onClick={() => setFiltroRecl(est)}
            >
              {est === '' ? 'Todos' : ESTADO_CONFIG[est]?.label}
            </button>
          ))}
        </div>

        <SolicitudesReclutadorSection
          solicitudesRecl={solicitudesRecl}
          loadingRecl={loadingRecl}
          filtroRecl={filtroRecl}
          confirmandoRecl={confirmandoRecl}
          onCancelarConfirmacion={() => setConfirmandoRecl(null)}
          accionandoRecl={accionandoRecl}
          onAprobar={handleAprobarRecl}
          onAbrirRechazo={abrirRechazoRecl}
          paginationRecl={paginationRecl}
          onPageChange={cargarRecl}
        />
      </div>

      {/* Modal de rechazo: reclutadores */}
      {modalRechazoRecl && detalleRecl && (
        <RechazarSolicitudModal
          titulo="❌ Rechazar solicitud de reclutador"
          motivo={motivoRecl}
          onMotivoChange={setMotivoRecl}
          motivoInputId="motivo-rechazo-recl"
          motivoLabel="Motivo"
          motivoPlaceholder="Razón del rechazo (se incluye en el email a la empresa)"
          rows={3}
          accionando={accionandoRecl}
          onClose={() => setModalRechazoRecl(false)}
          onConfirm={handleRechazarRecl}
        >
          Vas a rechazar la solicitud de <strong>{detalleRecl.nombre}</strong> ({detalleRecl.email}).
          Se enviará una notificación a la empresa propietaria.
        </RechazarSolicitudModal>
      )}
    </div>
  );
}
