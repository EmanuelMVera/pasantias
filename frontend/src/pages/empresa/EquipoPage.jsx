/**
 * EquipoPage.jsx — Gestión del equipo reclutador de la empresa.
 *
 * Ruta: /empresa/equipo
 * Acceso: solo admin_empresa puede enviar solicitudes y gestionar miembros.
 *         otros roles pueden ver (solo lectura).
 *
 * Flujo de alta de reclutadores:
 *   1. Propietario llena formulario (nombre + email) → POST /equipo/solicitar
 *   2. Admin aprueba → usuario creado automáticamente → email con credenciales
 *   3. Reclutador inicia sesión y cambia su contraseña desde /empresa/seguridad
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { empresaService } from '../../services/empresa.service';
import { useEmpresa } from '../../hooks/useEmpresa';
import MiembroEquipoCard from '../../components/MiembroEquipoCard/MiembroEquipoCard';
import SolicitarReclutadorModal from '../../components/SolicitarReclutadorModal/SolicitarReclutadorModal';
import SolicitudesReclutadoresTabla from '../../components/SolicitudesReclutadoresTabla/SolicitudesReclutadoresTabla';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';
import styles from './EquipoPage.module.css';

/* ── Componente principal ───────────────────────────────────────────────────── */
export default function EquipoPage() {
  const { esAdminEmpresa, empresa } = useEmpresa();
  const [equipo,      setEquipo]      = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [toast,       setToast]       = useState('');

  const [modalSolicitar,  setModalSolicitar]  = useState(false);
  const [modalSuspender,  setModalSuspender]  = useState(null); // miembro a suspender/reactivar
  const [modalEliminar,   setModalEliminar]   = useState(null); // miembro a quitar del equipo
  const [modalRecuperacion, setModalRecuperacion] = useState(null); // miembro a enviarle recuperación de acceso

  const esPropietario = esAdminEmpresa;
  const activos    = equipo.filter(m => m.activo !== false);
  const suspendidos = equipo.filter(m => m.activo === false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  useEffect(() => {
    async function cargar() {
      try {
        const equipoRes = await empresaService.getEquipo();
        // Decisión local e inmediata (no depende del context, que puede no
        // haber resuelto todavía) — solo se usa acá adentro, una sola vez.
        const rolRecibido = equipoRes.data.rolEnEquipo ?? null;
        setEquipo(equipoRes.data.data ?? []);

        if (rolRecibido === 'admin_empresa') {
          try {
            const solRes = await empresaService.getMisSolicitudesReclutador();
            setSolicitudes(solRes.data.data ?? []);
          } catch {
            // las solicitudes son UI secundaria; no bloquear si fallan
          }
        }
      } catch {
        setError('No se pudo cargar el equipo. Intentá de nuevo.');
      } finally {
        setLoading(false);
      }
    }
    cargar();
  }, []);

  const handleEnviada = (nueva) => {
    setSolicitudes(prev => [nueva, ...prev]);
    showToast(
      nueva.estado === 'aprobado'
        ? `✅ ${nueva.nombre} ya puede acceder al sistema — le enviamos las credenciales por email.`
        : '✅ Solicitud enviada. El administrador la revisará pronto.'
    );
  };

  const handleRecuperacion = (miembro) => {
    setModalRecuperacion(miembro);
  };

  const confirmarRecuperacion = async () => {
    const miembro = modalRecuperacion;
    if (!miembro) return;
    setModalRecuperacion(null);
    try {
      const { data } = await empresaService.enviarRecuperacionMiembro(miembro.id);
      showToast(data.message ?? '✓ Email de recuperación enviado.');
    } catch (err) {
      showToast(err.response?.data?.message ?? '✗ Error al enviar la recuperación de acceso.');
    }
  };

  const handleToggleActivo = async (miembro) => {
    // Abre el modal visual en lugar de window.confirm
    setModalSuspender(miembro);
  };

  const confirmarToggle = async () => {
    const miembro = modalSuspender;
    if (!miembro) return;
    const nuevoEstado = !miembro.activo;
    setModalSuspender(null);
    try {
      await empresaService.editarMiembro(miembro.id, { activo: nuevoEstado });
      setEquipo(prev => prev.map(m => m.id === miembro.id ? { ...m, activo: nuevoEstado } : m));
      showToast(`✓ Cuenta ${nuevoEstado ? 'reactivada' : 'suspendida'}.`);
    } catch {
      showToast('✗ Error al cambiar el estado.');
    }
  };

  const handleEliminar = (miembro) => {
    // Abre el modal de confirmación en lugar de window.confirm
    setModalEliminar(miembro);
  };

  const confirmarEliminar = async () => {
    const miembro = modalEliminar;
    if (!miembro) return;
    const nombre = miembro.usuario?.nombre ?? miembro.nombre;
    setModalEliminar(null);
    try {
      await empresaService.eliminarMiembro(miembro.id);
      setEquipo(prev => prev.filter(m => m.id !== miembro.id));
      showToast(`✓ ${nombre} fue quitado del equipo.`);
    } catch (err) {
      showToast(err.response?.data?.message ?? '✗ Error al quitar al miembro.');
    }
  };

  const solicitudesPendientes = solicitudes.filter(s => s.estado === 'pendiente');

  return (
    <div className="page-container">

      {/* ── Cabecera ── */}
      <div className="dashboard-header">
        <div>
          <Link to="/empresa" className="btn-back">← Volver al panel</Link>
          <h1>Gestión del equipo</h1>
          <p className={styles.subtitulo}>
            Administrá los accesos y roles de tu equipo de reclutadores.
          </p>
        </div>
        {esPropietario && (
          <button className={styles.btnPrimary} onClick={() => setModalSolicitar(true)} id="btn-nuevo-miembro">
            + Solicitar reclutador
          </button>
        )}
      </div>

      {/* Toast y error */}
      {toast && <div className={styles.toast}>{toast}</div>}
      {error && <p className={styles.errorMsg}>{error}</p>}

      {/* Skeleton */}
      {loading && (
        <div className={styles.skeletonList}>
          {[1, 2, 3].map(i => <div key={i} className={styles.skeletonRow} />)}
        </div>
      )}

      {/* ── Solicitudes pendientes — aviso destacado ── */}
      {!loading && solicitudesPendientes.length > 0 && (
        <div className={styles.alertPendiente}>
          <span>⏳</span>
          <span>
            Tenés <strong>{solicitudesPendientes.length}</strong> solicitud{solicitudesPendientes.length > 1 ? 'es' : ''} de reclutador pendiente{solicitudesPendientes.length > 1 ? 's' : ''} de aprobación por el administrador.
          </span>
        </div>
      )}

      {/* ── Stats ── */}
      {!loading && equipo.length > 0 && (
        <div className={styles.statsRow}>
          <div className={styles.statChip}>
            <span className={styles.statNum}>{equipo.length}</span><span>Total</span>
          </div>
          <div className={styles.statChip}>
            <span className={styles.statNum} style={{ color: '#16a34a' }}>{activos.length}</span><span>Activos</span>
          </div>
          {suspendidos.length > 0 && (
            <div className={styles.statChip}>
              <span className={styles.statNum} style={{ color: '#dc2626' }}>{suspendidos.length}</span><span>Suspendidos</span>
            </div>
          )}
          {solicitudesPendientes.length > 0 && (
            <div className={styles.statChip}>
              <span className={styles.statNum} style={{ color: '#ca8a04' }}>{solicitudesPendientes.length}</span><span>Solicitudes</span>
            </div>
          )}
        </div>
      )}

      {/* ── Lista activos ── */}
      {!loading && activos.length > 0 && (
        <section className={styles.seccion}>
          <h2 className={styles.seccionTitulo}>Miembros activos</h2>
          <div className={styles.listaCards}>
            {activos.map(m => (
              <MiembroEquipoCard key={m.id} miembro={m} empresa={empresa} esPropietario={esPropietario}
                onToggleActivo={handleToggleActivo} onEliminar={handleEliminar}
                onRecuperacion={handleRecuperacion}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Lista suspendidos ── */}
      {!loading && suspendidos.length > 0 && (
        <section className={styles.seccion}>
          <h2 className={styles.seccionTitulo} style={{ color: 'var(--text-muted)' }}>Cuentas suspendidas</h2>
          <div className={styles.listaCards}>
            {suspendidos.map(m => (
              <MiembroEquipoCard key={m.id} miembro={m} empresa={empresa} esPropietario={esPropietario}
                onToggleActivo={handleToggleActivo} onEliminar={handleEliminar}
                onRecuperacion={handleRecuperacion}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Historial de solicitudes de reclutadores ── */}
      {!loading && solicitudes.length > 0 && (
        <SolicitudesReclutadoresTabla solicitudes={solicitudes} />
      )}

      {/* ── Estado vacío ── */}
      {!loading && equipo.length === 0 && solicitudes.length === 0 && (
        <div className={styles.emptyState}>
          <span>👥</span>
          <p>El equipo está vacío.</p>
          {esPropietario && (
            <button className={styles.btnPrimary} onClick={() => setModalSolicitar(true)}>
              + Solicitar primer reclutador
            </button>
          )}
        </div>
      )}

      {/* ── Modales ── */}
      {modalSolicitar && (
        <SolicitarReclutadorModal
          onClose={() => setModalSolicitar(false)}
          onEnviada={handleEnviada}
          esConfiable={empresa?.nivelConfianza === 'confiable'}
        />
      )}

      {/* Modal confirmar suspender / reactivar */}
      {modalSuspender && (
        <ConfirmModal
          title={modalSuspender.activo ? '🔒 Suspender cuenta' : '🔓 Reactivar cuenta'}
          icon={modalSuspender.activo ? '🔒' : '🔓'}
          iconBg={modalSuspender.activo ? '#fee2e2' : '#dcfce7'}
          miembro={modalSuspender}
          notaTone={modalSuspender.activo ? 'warn' : 'success'}
          nota={modalSuspender.activo
            ? '⚠️ Al suspender, el usuario no podrá iniciar sesión hasta que se reactive. Sus datos y acciones previas se conservan.'
            : '✅ Al reactivar, el usuario recuperará el acceso al sistema con su rol actual.'}
          confirmTone={modalSuspender.activo ? 'danger' : 'success'}
          confirmLabel={modalSuspender.activo ? '🔒 Sí, suspender' : '🔓 Sí, reactivar'}
          onConfirm={confirmarToggle}
          onClose={() => setModalSuspender(null)}
        />
      )}

      {/* Modal confirmar quitar del equipo (desvincular) */}
      {modalEliminar && (
        <ConfirmModal
          title="🗑️ Quitar del equipo"
          icon="🗑️"
          iconBg="#fee2e2"
          miembro={modalEliminar}
          notaTone="warn"
          nota='⚠️ A diferencia de suspender, para que vuelva a tener acceso vas a tener que solicitar su alta de nuevo desde "Solicitar reclutador". Sus datos y postulaciones gestionadas se conservan.'
          confirmTone="danger"
          confirmLabel="🗑️ Sí, quitar del equipo"
          onConfirm={confirmarEliminar}
          onClose={() => setModalEliminar(null)}
        />
      )}

      {/* Modal confirmar envío de recuperación de acceso (EST-10) */}
      {modalRecuperacion && (
        <ConfirmModal
          title="🔑 Enviar recuperación de acceso"
          icon="📧"
          iconBg="#eff6ff"
          miembro={modalRecuperacion}
          notaTone="info"
          nota="ℹ️ Le vamos a enviar un email con un link para que establezca su propia contraseña. Vos no la vas a ver ni a elegir en ningún momento."
          confirmTone="info"
          confirmLabel="📧 Sí, enviar recuperación"
          onConfirm={confirmarRecuperacion}
          onClose={() => setModalRecuperacion(null)}
        />
      )}
    </div>
  );
}
