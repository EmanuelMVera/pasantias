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
import { empresaService } from '../../services/api';
import styles from './EquipoPage.module.css';

/* ── Helpers ─────────────────────────────────────────────────────────────────── */
const ROL_COLORS = { admin_empresa: '#7c3aed', reclutador: '#0891b2' };
function rolColor(rol) { return ROL_COLORS[rol] ?? '#64748b'; }
function rolLabel(rol) {
  return { admin_empresa: 'Administrador', reclutador: 'Reclutador' }[rol] ?? rol;
}
function formatFecha(iso) {
  if (!iso) return 'Nunca';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const ESTADO_SOLICITUD = {
  pendiente:  { label: 'Pendiente',  color: '#ca8a04', bg: '#fef9c3' },
  aprobado:   { label: 'Aprobado',   color: '#15803d', bg: '#dcfce7' },
  rechazado:  { label: 'Rechazado',  color: '#dc2626', bg: '#fee2e2' },
};

/* ── Modal genérico ─────────────────────────────────────────────────────────── */
function Modal({ titulo, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>{titulo}</h3>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Modal: Solicitar reclutador ────────────────────────────────────────────── */
function ModalSolicitarReclutador({ onClose, onEnviada }) {
  const [form, setForm] = useState({ nombre: '', apellido: '', email: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.apellido.trim() || !form.email.trim()) {
      setError('Nombre, apellido y email son requeridos.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await empresaService.solicitarReclutador(form);
      onEnviada(data.data);
      onClose();
    } catch (err) {
      const code = err.response?.data?.code;
      const msg  = err.response?.data?.message ?? 'Error al enviar la solicitud.';
      // Mensajes específicos según el código de error del backend
      if (code === 'EMAIL_REGISTRADO') {
        setError('Ese email ya tiene una cuenta en el sistema. Contactate con el administrador.');
      } else if (code === 'EMAIL_SOLICITUD_PENDIENTE') {
        setError('Ya existe una solicitud pendiente para ese email en tu empresa.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal titulo="📋 Solicitar nuevo reclutador" onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.modalForm}>

        <div className={styles.infoBox}>
          <span>ℹ️</span>
          <span>
            La solicitud será revisada por el administrador del instituto.
            Al aprobarla, se creará la cuenta y se enviarán las credenciales por email.
          </span>
        </div>

        <div className={styles.fieldGroup}>
          <label>Nombre *</label>
          <input
            type="text"
            value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            placeholder="Juan"
            required
            autoFocus
          />
        </div>

        <div className={styles.fieldGroup}>
          <label>Apellido *</label>
          <input
            type="text"
            value={form.apellido}
            onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))}
            placeholder="Pérez"
            required
          />
        </div>

        <div className={styles.fieldGroup}>
          <label>Email *</label>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="reclutador@empresa.com"
            required
          />
        </div>

        {error && <p className={styles.errorMsg}>⚠️ {error}</p>}

        <div className={styles.modalActions}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancelar</button>
          <button type="submit" className={styles.btnPrimary} disabled={loading}>
            {loading ? 'Enviando...' : '📤 Enviar solicitud'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Modal: Cambiar contraseña ──────────────────────────────────────────────── */
function ModalCambiarPassword({ miembro, onClose, onGuardado }) {
  const [pwd, setPwd] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pwd.length < 6) { setError('Mínimo 6 caracteres.'); return; }
    setLoading(true);
    try {
      await empresaService.resetPasswordMiembro(miembro.id, pwd);
      onGuardado();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal titulo={`🔑 Cambiar contraseña — ${miembro.usuario?.nombre ?? miembro.nombre}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.modalForm}>
        <div className={styles.fieldGroup}>
          <label>Nueva contraseña *</label>
          <div className={styles.passwordField}>
            <input
              type={mostrar ? 'text' : 'password'}
              value={pwd}
              onChange={e => { setPwd(e.target.value); setError(''); }}
              placeholder="Mínimo 6 caracteres"
              autoFocus required
            />
            <button type="button" className={styles.togglePwd} onClick={() => setMostrar(p => !p)}>
              {mostrar ? '🙈' : '👁️'}
            </button>
          </div>
          {pwd.length > 0 && pwd.length < 6 && (
            <span className={styles.errorMsg}>Debe tener al menos 6 caracteres</span>
          )}
        </div>
        {error && <p className={styles.errorMsg}>{error}</p>}
        <div className={styles.modalActions}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancelar</button>
          <button type="submit" className={styles.btnPrimary} disabled={loading || pwd.length < 6}>
            {loading ? 'Guardando...' : '🔑 Cambiar contraseña'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Modal: Editar rol ──────────────────────────────────────────────────────── */
// Solo reclutador es asignable manualmente; admin_empresa lo define el flujo de aprobación
const ROLES = [
  { value: 'reclutador', label: 'Reclutador', color: '#0891b2', desc: 'Crea ofertas y gestiona candidatos' },
];

function ModalEditarRol({ miembro, onClose, onGuardado }) {
  const [rolInterno, setRol] = useState(miembro.rolInterno ?? 'reclutador');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await empresaService.editarMiembro(miembro.id, { rolInterno });
      onGuardado(rolInterno);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cambiar el rol.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal titulo={`✏️ Cambiar rol — ${miembro.usuario?.nombre ?? miembro.nombre}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.modalForm}>
        <div className={styles.fieldGroup}>
          <label>Rol en el equipo</label>
          <div className={styles.rolRadioGroup}>
            {ROLES.map(r => (
              <label key={r.value}
                className={`${styles.rolRadio} ${rolInterno === r.value ? styles.rolRadioActive : ''}`}
                style={rolInterno === r.value ? { borderColor: r.color, background: r.color + '12' } : {}}
              >
                <input type="radio" name="rolInterno" value={r.value} checked={rolInterno === r.value} onChange={() => setRol(r.value)} />
                <div>
                  <strong style={rolInterno === r.value ? { color: r.color } : {}}>{r.label}</strong>
                  <span>{r.desc}</span>
                </div>
              </label>
            ))}
          </div>
        </div>
        {error && <p className={styles.errorMsg}>{error}</p>}
        <div className={styles.modalActions}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancelar</button>
          <button type="submit" className={styles.btnPrimary} disabled={loading}>
            {loading ? 'Guardando...' : '✓ Guardar rol'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Tarjeta de miembro ─────────────────────────────────────────────────────── */
function MiembroCard({ miembro, esPropietario, onToggleActivo, onEliminar }) {
  const u = miembro.usuario ?? miembro;
  const nombre = `${u.nombre ?? ''} ${u.apellido ?? ''}`.trim() || u.email;
  const inicial = nombre[0]?.toUpperCase() ?? '?';
  const esProp = miembro.rolInterno === 'admin_empresa';
  const [imgError, setImgError] = useState(false);

  return (
    <div className={`${styles.miembroCard} ${!miembro.activo ? styles.miembroInactivo : ''}`}>
      <div className={styles.cardAvatar} style={{ background: rolColor(miembro.rolInterno) }}>
        {u.fotoPerfil && !imgError
          ? <img src={u.fotoPerfil} alt={nombre} onError={() => setImgError(true)} className={styles.avatarImg} />
          : inicial}
      </div>
      <div className={styles.cardInfo}>
        <div className={styles.cardNombre}>
          <strong>{nombre}</strong>
          {esProp && <span className={styles.propietarioBadge}>Administrador</span>}
          {!miembro.activo && <span className={styles.suspendidoBadge}>Suspendido</span>}
        </div>
        <span className={styles.cardEmail}>{u.email}</span>
        <div className={styles.cardMeta}>
          <span className={styles.cardFecha}>Último acceso: {formatFecha(u.ultimoAcceso)}</span>
        </div>
      </div>
      {esPropietario && !esProp && (
        <div className={styles.cardAcciones}>
          <button
            className={`${styles.btnAccion} ${miembro.activo ? styles.btnWarning : styles.btnOk}`}
            onClick={() => onToggleActivo(miembro)}
          >
            {miembro.activo ? '⏸ Suspender' : '▶ Reactivar'}
          </button>
          <button
            className={`${styles.btnAccion} ${styles.btnDanger}`}
            onClick={() => onEliminar(miembro)}
          >
            🗑️ Quitar del equipo
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Fila de solicitud de reclutador ────────────────────────────────────────── */
function SolicitudRow({ sol }) {
  const est = ESTADO_SOLICITUD[sol.estado] ?? ESTADO_SOLICITUD.pendiente;
  return (
    <tr>
      <td><strong>{sol.nombre}</strong></td>
      <td style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{sol.email}</td>
      <td>
        <span style={{ background: est.bg, color: est.color, padding: '3px 10px', borderRadius: 99, fontSize: '0.8rem', fontWeight: 600 }}>
          {est.label}
        </span>
      </td>
      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
        {new Date(sol.createdAt).toLocaleDateString('es-AR')}
      </td>
    </tr>
  );
}

/* ── Componente principal ───────────────────────────────────────────────────── */
export default function EquipoPage() {
  const [equipo,      setEquipo]      = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [toast,       setToast]       = useState('');
  const [rolEnEquipo, setRolEnEquipo] = useState(null);

  const [modalSolicitar,  setModalSolicitar]  = useState(false);
  const [modalRol,        setModalRol]        = useState(null);
  const [modalPwd,        setModalPwd]        = useState(null);
  const [modalSuspender,  setModalSuspender]  = useState(null); // miembro a suspender/reactivar
  const [modalEliminar,   setModalEliminar]   = useState(null); // miembro a quitar del equipo

  const esPropietario = rolEnEquipo === 'admin_empresa';
  const activos    = equipo.filter(m => m.activo !== false);
  const suspendidos = equipo.filter(m => m.activo === false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  useEffect(() => {
    async function cargar() {
      try {
        const equipoRes = await empresaService.getEquipo();
        const rolRecibido = equipoRes.data.rolEnEquipo ?? null;
        setEquipo(equipoRes.data.data ?? []);
        setRolEnEquipo(rolRecibido);

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
    showToast('✅ Solicitud enviada. El administrador la revisará pronto.');
  };

  const handleRolGuardado = (id, nuevoRol) => {
    setEquipo(prev => prev.map(m => m.id === id ? { ...m, rolInterno: nuevoRol } : m));
    showToast('✓ Rol actualizado.');
  };

  const handlePwdGuardada = () => {
    showToast('✓ Contraseña actualizada.');
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
          <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontSize: '0.9rem' }}>
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
              <MiembroCard key={m.id} miembro={m} esPropietario={esPropietario}
                onToggleActivo={handleToggleActivo} onEliminar={handleEliminar}
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
              <MiembroCard key={m.id} miembro={m} esPropietario={esPropietario}
                onToggleActivo={handleToggleActivo} onEliminar={handleEliminar}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Historial de solicitudes de reclutadores ── */}
      {!loading && solicitudes.length > 0 && (
        <section className={styles.seccion} style={{ marginTop: '2rem' }}>
          <h2 className={styles.seccionTitulo}>Solicitudes de reclutadores</h2>
          <div className={styles.tablaWrap}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {solicitudes.map(s => <SolicitudRow key={s.id} sol={s} />)}
              </tbody>
            </table>
          </div>
        </section>
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
        <ModalSolicitarReclutador
          onClose={() => setModalSolicitar(false)}
          onEnviada={handleEnviada}
        />
      )}
      {modalRol && (
        <ModalEditarRol
          miembro={modalRol}
          onClose={() => setModalRol(null)}
          onGuardado={(nuevoRol) => { handleRolGuardado(modalRol.id, nuevoRol); setModalRol(null); }}
        />
      )}
      {modalPwd && (
        <ModalCambiarPassword
          miembro={modalPwd}
          onClose={() => setModalPwd(null)}
          onGuardado={handlePwdGuardada}
        />
      )}

      {/* Modal confirmar suspender / reactivar */}
      {modalSuspender && (
        <div className={styles.overlay} onClick={() => setModalSuspender(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className={styles.modalHeader}>
              <h3>{modalSuspender.activo ? '🔒 Suspender cuenta' : '🔓 Reactivar cuenta'}</h3>
              <button className={styles.modalClose} onClick={() => setModalSuspender(null)}>✕</button>
            </div>

            {/* Avatar + nombre centrado */}
            <div style={{ textAlign: 'center', padding: '1.5rem 1.5rem 0' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', margin: '0 auto 0.75rem',
                background: modalSuspender.activo ? '#fee2e2' : '#dcfce7',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.8rem',
              }}>
                {modalSuspender.activo ? '🔒' : '🔓'}
              </div>
              <p style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem' }}>
                {(modalSuspender.usuario?.nombre ?? modalSuspender.nombre ?? '')} {modalSuspender.usuario?.apellido ?? ''}
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {modalSuspender.usuario?.email ?? modalSuspender.email}
              </p>
            </div>

            {/* Mensaje contextual */}
            <div style={{
              margin: '0 1.5rem 1.5rem',
              padding: '0.9rem 1rem',
              borderRadius: '8px',
              background: modalSuspender.activo ? '#fff7ed' : '#f0fdf4',
              border: `1px solid ${modalSuspender.activo ? '#fed7aa' : '#bbf7d0'}`,
              fontSize: '0.88rem',
              color: modalSuspender.activo ? '#92400e' : '#166534',
            }}>
              {modalSuspender.activo
                ? '⚠️ Al suspender, el usuario no podrá iniciar sesión hasta que se reactive. Sus datos y acciones previas se conservan.'
                : '✅ Al reactivar, el usuario recuperará el acceso al sistema con su rol actual.'
              }
            </div>

            <div className={styles.modalActions}>
              <button className={styles.btnSecondary} onClick={() => setModalSuspender(null)}>Cancelar</button>
              <button
                onClick={confirmarToggle}
                style={{
                  background: modalSuspender.activo ? '#dc2626' : '#16a34a',
                  color: '#fff', border: 'none', borderRadius: '8px',
                  padding: '0.6rem 1.4rem', fontWeight: 600, cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                {modalSuspender.activo ? '🔒 Sí, suspender' : '🔓 Sí, reactivar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar quitar del equipo (desvincular) */}
      {modalEliminar && (
        <div className={styles.overlay} onClick={() => setModalEliminar(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className={styles.modalHeader}>
              <h3>🗑️ Quitar del equipo</h3>
              <button className={styles.modalClose} onClick={() => setModalEliminar(null)}>✕</button>
            </div>

            <div style={{ textAlign: 'center', padding: '1.5rem 1.5rem 0' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', margin: '0 auto 0.75rem',
                background: '#fee2e2',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.8rem',
              }}>
                🗑️
              </div>
              <p style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem' }}>
                {(modalEliminar.usuario?.nombre ?? modalEliminar.nombre ?? '')} {modalEliminar.usuario?.apellido ?? ''}
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {modalEliminar.usuario?.email ?? modalEliminar.email}
              </p>
            </div>

            <div style={{
              margin: '0 1.5rem 1.5rem',
              padding: '0.9rem 1rem',
              borderRadius: '8px',
              background: '#fff7ed',
              border: '1px solid #fed7aa',
              fontSize: '0.88rem',
              color: '#92400e',
            }}>
              ⚠️ A diferencia de suspender, para que vuelva a tener acceso vas a tener que
              solicitar su alta de nuevo desde "Solicitar reclutador". Sus datos y postulaciones
              gestionadas se conservan.
            </div>

            <div className={styles.modalActions}>
              <button className={styles.btnSecondary} onClick={() => setModalEliminar(null)}>Cancelar</button>
              <button
                onClick={confirmarEliminar}
                style={{
                  background: '#dc2626',
                  color: '#fff', border: 'none', borderRadius: '8px',
                  padding: '0.6rem 1.4rem', fontWeight: 600, cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                🗑️ Sí, quitar del equipo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
