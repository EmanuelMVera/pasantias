/**
 * AdminSolicitudesPage.jsx — Gestión de solicitudes (empresas y reclutadores).
 *
 * Una sola pantalla con dos pestañas — solo se renderiza la activa:
 *  - Empresas: solicitudes de registro. La fila abre un detalle (panel lateral
 *    en escritorio, Modal en pantallas angostas) donde se aprueba o rechaza.
 *  - Reclutadores: altas solicitadas por empresas ya registradas. La fila abre
 *    un Modal de revisión.
 *
 * Cada pestaña mantiene su propio estado (lista, filtro, página, conteos), se
 * cargan ambas al montar para poder mostrar los pendientes en las pestañas, y
 * un único botón "Actualizar" refresca la pestaña activa.
 *
 * Ruta: /admin/solicitudes  (`?tab=reclutadores` abre la segunda pestaña)
 * Acceso: solo rol 'admin'
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminService } from '../../services/admin.service';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useToast } from '../../hooks/useToast';
import PageHeader from '../../components/ui/PageHeader';
import Tabs, { TabPanel } from '../../components/ui/Tabs';
import Toast from '../../components/ui/Toast';
import Modal from '../../components/Modal/Modal';
import Icon from '../../components/ui/Icon';
import SolicitudesStatsRow from '../../components/SolicitudesStatsRow/SolicitudesStatsRow';
import SolicitudesFiltroEstado from '../../components/SolicitudesFiltroEstado/SolicitudesFiltroEstado';
import RechazarSolicitudModal from '../../components/RechazarSolicitudModal/RechazarSolicitudModal';
import SolicitudesEmpresaSection from '../../components/SolicitudesEmpresaSection/SolicitudesEmpresaSection';
import SolicitudEmpresaDetalle from '../../components/SolicitudEmpresaDetalle/SolicitudEmpresaDetalle';
import SolicitudesReclutadorSection from '../../components/SolicitudesReclutadorSection/SolicitudesReclutadorSection';
import SolicitudReclutadorRevision from '../../components/SolicitudReclutadorRevision/SolicitudReclutadorRevision';
import styles from './AdminSolicitudesPage.module.css';

const sumar = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

const statsDe = (conteo) => ({
  total:     sumar(conteo),
  pendiente: conteo.pendiente ?? 0,
  aprobado:  conteo.aprobado  ?? 0,
  rechazado: conteo.rechazado ?? 0,
});

export default function AdminSolicitudesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'reclutadores' ? 'reclutadores' : 'empresas';
  const setTab = (t) => setSearchParams(t === 'empresas' ? {} : { tab: t }, { replace: true });

  // El detalle de empresa va en un panel lateral si hay lugar, si no en un Modal.
  const panelLateral = useMediaQuery('(min-width: 1101px)');
  const { toast, showToast } = useToast(6000);
  const [error, setError] = useState('');

  // ── Estado: solicitudes de empresa ────────────────────────────────────────
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState(''); // '' | 'pendiente' | 'aprobado' | 'rechazado'
  const [paginationEmp, setPaginationEmp] = useState(null);
  const [conteoEmp, setConteoEmp] = useState({});
  const [pageEmp, setPageEmp] = useState(1);
  const [detalle, setDetalle] = useState(null);          // solicitud abierta en el detalle
  const [accionando, setAccionando] = useState(false);
  const [confirmando, setConfirmando] = useState(false); // paso de confirmación de la aprobación
  const [modalRechazo, setModalRechazo] = useState(false);
  const [motivo, setMotivo] = useState('');

  // ── Estado: solicitudes de reclutador ─────────────────────────────────────
  const [solicitudesRecl, setSolicitudesRecl] = useState([]);
  const [loadingRecl, setLoadingRecl] = useState(true);
  const [filtroRecl, setFiltroRecl] = useState('');
  const [paginationRecl, setPaginationRecl] = useState(null);
  const [conteoRecl, setConteoRecl] = useState({});
  const [pageRecl, setPageRecl] = useState(1);
  const [detalleRecl, setDetalleRecl] = useState(null);
  const [accionandoRecl, setAccionandoRecl] = useState(false);
  const [confirmandoRecl, setConfirmandoRecl] = useState(false);
  const [modalRechazoRecl, setModalRechazoRecl] = useState(false);
  const [motivoRecl, setMotivoRecl] = useState('');

  // ── Carga de datos ────────────────────────────────────────────────────────
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
      setError('No se pudieron cargar las solicitudes de empresa.');
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
      setError('No se pudieron cargar las solicitudes de reclutador.');
    } finally {
      setLoadingRecl(false);
    }
  }, [filtroRecl]);

  useEffect(() => { cargar(1);     }, [cargar]);
  useEffect(() => { cargarRecl(1); }, [cargarRecl]);

  // Un único "Actualizar", contextual a la pestaña activa (recarga la página actual).
  const actualizar = () => (tab === 'empresas' ? cargar(pageEmp) : cargarRecl(pageRecl));
  const actualizando = tab === 'empresas' ? loading : loadingRecl;

  // ── Empresas: revisar / aprobar / rechazar ────────────────────────────────
  const abrirDetalle = (solicitud) => { setDetalle(solicitud); setConfirmando(false); };
  const cerrarDetalle = () => { setDetalle(null); setConfirmando(false); };

  const handleAprobar = async (solicitud) => {
    setAccionando(true);
    setError('');
    try {
      const res = await adminService.aprobarSolicitud(solicitud.id);
      const { data } = res.data;
      const emailDestino = solicitud.responsableEmail || solicitud.email;
      showToast(
        `"${solicitud.razonSocial}" aprobada. Credenciales enviadas a ${emailDestino}` +
        (data?.passwordGenerada ? ` (pwd dev: ${data.passwordGenerada})` : '') +
        (data?.reclutadoresPendientes ? ` · ${data.reclutadoresPendientes} solicitud(es) de reclutador creadas.` : ''),
        'success',
      );
      cerrarDetalle();
      cargar(pageEmp);
      cargarRecl(pageRecl); // la aprobación puede crear solicitudes de reclutador
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al aprobar la solicitud.');
      setConfirmando(false);
    } finally {
      setAccionando(false);
    }
  };

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
      showToast(`Solicitud de "${detalle.razonSocial}" rechazada. Notificación enviada.`, 'success');
      setModalRechazo(false);
      cerrarDetalle();
      cargar(pageEmp);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al rechazar la solicitud.');
      setModalRechazo(false);
    } finally {
      setAccionando(false);
    }
  };

  // ── Reclutadores: revisar / aprobar / rechazar ────────────────────────────
  const abrirRevisionRecl = (sol) => { setDetalleRecl(sol); setConfirmandoRecl(false); };
  const cerrarRevisionRecl = () => { setDetalleRecl(null); setConfirmandoRecl(false); };

  const handleAprobarRecl = async (sol) => {
    setAccionandoRecl(true);
    setError('');
    try {
      const res = await adminService.aprobarSolicitudReclutador(sol.id);
      const { data } = res.data;
      showToast(
        `Reclutador "${sol.nombre}" aprobado. Credenciales enviadas a ${sol.email}` +
        (data?.passwordGenerada ? ` (pwd dev: ${data.passwordGenerada})` : ''),
        'success',
      );
      cerrarRevisionRecl();
      cargarRecl(pageRecl);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al aprobar.');
      setConfirmandoRecl(false);
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
      showToast(`Solicitud de "${detalleRecl.nombre}" rechazada. Notificación enviada a la empresa.`, 'success');
      setModalRechazoRecl(false);
      cerrarRevisionRecl();
      cargarRecl(pageRecl);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al rechazar.');
      setModalRechazoRecl(false);
    } finally {
      setAccionandoRecl(false);
    }
  };

  // ── Estadísticas rápidas (del sidecar conteoPorEstado, sobre TODO el set) ──
  const stats = statsDe(conteoEmp);
  const statsRecl = statsDe(conteoRecl);

  const propsDetalleEmpresa = {
    detalle,
    accionando,
    confirmando,
    onPedirConfirmacion: () => setConfirmando(true),
    onCancelarConfirmacion: () => setConfirmando(false),
    onConfirmarAprobacion: handleAprobar,
    onAbrirRechazo: abrirRechazo,
  };

  return (
    <div className="page-container">
      <Toast toast={toast} />

      <PageHeader
        title="Solicitudes"
        subtitle="Gestioná solicitudes de empresas y altas de reclutadores."
        actions={(
          <button type="button" className="btn-secondary" onClick={actualizar} disabled={actualizando}>
            <Icon name="refresh" size={18} />
            Actualizar
          </button>
        )}
      />

      {error && <p className={`error-msg ${styles.error}`}>{error}</p>}

      <Tabs
        idPrefix="sol"
        ariaLabel="Tipo de solicitud"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'empresas', label: 'Empresas', icon: 'building', count: stats.pendiente, alerta: true },
          { key: 'reclutadores', label: 'Reclutadores', icon: 'userPlus', count: statsRecl.pendiente, alerta: true },
        ]}
      />

      <TabPanel idPrefix="sol" tabKey={tab}>
        {tab === 'empresas' ? (
          <>
            <SolicitudesStatsRow items={[
              { label: 'Total',      value: stats.total,     iconName: 'list',        tone: 'blue' },
              { label: 'Pendientes', value: stats.pendiente, iconName: 'clock',       tone: 'orange' },
              { label: 'Aprobadas',  value: stats.aprobado,  iconName: 'checkCircle', tone: 'green' },
              { label: 'Rechazadas', value: stats.rechazado, iconName: 'xCircle',     tone: 'red' },
            ]} />

            <div className={styles.toolbar}>
              <SolicitudesFiltroEstado value={filtroEstado} onChange={setFiltroEstado} idPrefix="filtro" />
            </div>

            <div className={`${styles.layout} ${detalle && panelLateral ? styles.conPanel : ''}`}>
              <div className={styles.lista}>
                <SolicitudesEmpresaSection
                  solicitudes={solicitudes}
                  loading={loading}
                  filtroEstado={filtroEstado}
                  detalleId={detalle?.id}
                  onRevisar={abrirDetalle}
                  paginationEmp={paginationEmp}
                  onPageChange={cargar}
                />
              </div>

              {detalle && panelLateral && (
                <aside className={styles.detallePanel} aria-label="Detalle de solicitud">
                  <div className={styles.detallePanelHeader}>
                    <h2>Detalle de solicitud</h2>
                    <button type="button" className={styles.cerrarDetalle} onClick={cerrarDetalle} aria-label="Cerrar detalle">
                      <Icon name="close" size={20} />
                    </button>
                  </div>
                  <SolicitudEmpresaDetalle {...propsDetalleEmpresa} />
                </aside>
              )}
            </div>
          </>
        ) : (
          <>
            <SolicitudesStatsRow items={[
              { label: 'Total',      value: statsRecl.total,     iconName: 'list',        tone: 'blue' },
              { label: 'Pendientes', value: statsRecl.pendiente, iconName: 'clock',       tone: 'orange' },
              { label: 'Aprobados',  value: statsRecl.aprobado,  iconName: 'checkCircle', tone: 'green' },
              { label: 'Rechazados', value: statsRecl.rechazado, iconName: 'xCircle',     tone: 'red' },
            ]} />

            <div className={styles.toolbar}>
              <SolicitudesFiltroEstado value={filtroRecl} onChange={setFiltroRecl} idPrefix="filtro-recl" />
            </div>

            <SolicitudesReclutadorSection
              solicitudesRecl={solicitudesRecl}
              loadingRecl={loadingRecl}
              filtroRecl={filtroRecl}
              onRevisar={abrirRevisionRecl}
              paginationRecl={paginationRecl}
              onPageChange={cargarRecl}
            />
          </>
        )}
      </TabPanel>

      {/* Detalle de empresa en pantallas angostas: Modal (no queda apilado sin foco) */}
      {detalle && !panelLateral && !modalRechazo && (
        <Modal title="Detalle de solicitud" onClose={cerrarDetalle}>
          <div className={styles.detalleModal}>
            <SolicitudEmpresaDetalle {...propsDetalleEmpresa} />
          </div>
        </Modal>
      )}

      {/* Rechazo de empresa */}
      {modalRechazo && detalle && (
        <RechazarSolicitudModal
          titulo="Rechazar solicitud"
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

      {/* Revisión de reclutador */}
      {detalleRecl && !modalRechazoRecl && (
        <SolicitudReclutadorRevision
          solicitud={detalleRecl}
          accionando={accionandoRecl}
          confirmando={confirmandoRecl}
          onPedirConfirmacion={() => setConfirmandoRecl(true)}
          onCancelarConfirmacion={() => setConfirmandoRecl(false)}
          onConfirmarAprobacion={handleAprobarRecl}
          onAbrirRechazo={abrirRechazoRecl}
          onClose={cerrarRevisionRecl}
        />
      )}

      {/* Rechazo de reclutador */}
      {modalRechazoRecl && detalleRecl && (
        <RechazarSolicitudModal
          titulo="Rechazar solicitud de reclutador"
          motivo={motivoRecl}
          onMotivoChange={setMotivoRecl}
          motivoInputId="motivo-rechazo-recl"
          motivoLabel="Motivo"
          motivoPlaceholder="Razón del rechazo (se incluye en el email a la empresa)"
          rows={3}
          accionando={accionandoRecl}
          onClose={() => setModalRechazoRecl(false)}
          onConfirm={handleRechazarRecl}
          confirmButtonId="btn-confirmar-rechazo-recl"
        >
          Vas a rechazar la solicitud de <strong>{detalleRecl.nombre}</strong> ({detalleRecl.email}).
          Se enviará una notificación a la empresa propietaria.
        </RechazarSolicitudModal>
      )}
    </div>
  );
}
