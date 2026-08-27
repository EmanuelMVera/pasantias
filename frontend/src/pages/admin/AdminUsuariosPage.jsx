/**
 * AdminUsuariosPage.jsx — Gestión completa de usuarios del sistema.
 *
 * Permite al administrador:
 * - Ver todos los usuarios con filtros por rol, estado y búsqueda de texto
 * - Crear nuevos usuarios con cualquier rol
 * - Editar datos, rol y estado de usuarios existentes
 * - Eliminar (desactivar) usuarios
 * - Activar/desactivar cuentas con un toggle
 */

import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../services/api';
import Modal from '../../components/Modal/Modal';
import styles from './AdminUsuariosPage.module.css';

/* Roles disponibles en el sistema */
const ROLES = ['alumno', 'egresado', 'empresa', 'admin'];

/* Etiquetas y colores para cada rol */
const ROL_BADGE = {
  alumno:   { label: 'Alumno',   color: '#0073AD' },
  egresado: { label: 'Egresado', color: '#8e44ad' },
  empresa:  { label: 'Empresa',  color: '#e67e22' },
  admin:    { label: 'Admin',    color: '#c0392b' },
};

/* Etiquetas para rolInterno dentro de empresa_usuarios */
const ROL_INTERNO_LABEL = {
  admin_empresa: 'Administrador de empresa',
  reclutador:    'Reclutador',
  // Valores legacy — ya no se asignan pero pueden aparecer en datos históricos
  propietario: 'Propietario (legacy)',
  gerente:     'Gerente (legacy)',
  viewer:      'Solo lectura (legacy)',
};

/**
 * Devuelve { label, sub, color } para el badge de rol.
 * Para usuarios 'empresa' muestra el rolInterno (Propietario/Reclutador/etc.)
 * y el nombre de la empresa como subtexto.
 */
function getRolInfo(u) {
  if (u.rol === 'empresa' && u.membresiasEmpresa?.length > 0) {
    const mem      = u.membresiasEmpresa[0];
    const rolLabel = ROL_INTERNO_LABEL[mem.rolInterno] ?? mem.rolInterno;
    const empresa  = mem.empresa?.razonSocial ?? '';
    return { label: rolLabel, sub: empresa, color: '#e67e22' };
  }
  const badge = ROL_BADGE[u.rol] ?? { label: u.rol, color: '#666' };
  return { label: badge.label, sub: '', color: badge.color };
}

/* Estado inicial del formulario (crear/editar) */
const FORM_VACIO = {
  nombre: '', apellido: '', email: '',
  password: '', rol: 'alumno',
  telefono: '', ubicacion: '', activo: true,
  legajo: '',
};

export default function AdminUsuariosPage() {
  const [usuarios,    setUsuarios]   = useState([]);
  const [loading,     setLoading]    = useState(true);
  const [error,       setError]      = useState('');
  const [success,     setSuccess]    = useState('');

  // Filtros
  const [busqueda,    setBusqueda]   = useState('');
  const [filtroRol,   setFiltroRol]  = useState('');
  const [filtroActivo, setFiltroActivo] = useState('');

  // Modal
  const [modal,       setModal]      = useState(null);   // null | 'crear' | 'editar' | 'confirmar'
  const [editando,    setEditando]   = useState(null);   // usuario a editar
  const [eliminando,  setEliminando] = useState(null);   // usuario a eliminar
  const [form,        setForm]       = useState(FORM_VACIO);
  const [formLoading, setFormLoading] = useState(false);
  const [formError,   setFormError]  = useState('');

  /* ── Carga de usuarios con filtros ────────────────────────────────── */
  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filtroRol)           params.rol    = filtroRol;
      if (filtroActivo !== '') params.activo  = filtroActivo;
      if (busqueda)            params.q       = busqueda;
      const res = await adminService.getUsuarios(params);
      setUsuarios(res.data.data ?? res.data ?? []);
    } catch {
      setError('No se pudieron cargar los usuarios.');
    } finally {
      setLoading(false);
    }
  }, [filtroRol, filtroActivo, busqueda]);

  useEffect(() => { cargar(); }, [cargar]);

  /* ── Helpers de UI ────────────────────────────────────────────────── */
  const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

  const abrirCrear = () => { setForm(FORM_VACIO); setFormError(''); setModal('crear'); };
  const abrirEditar = (u) => {
    setEditando(u);
    setForm({ nombre: u.nombre, apellido: u.apellido, email: u.email, password: '', rol: u.rol, telefono: u.telefono ?? '', ubicacion: u.ubicacion ?? '', activo: u.activo, legajo: u.perfil?.legajo ?? '' });
    setFormError('');
    setModal('editar');
  };
  const abrirConfirmar = (u) => { setEliminando(u); setModal('confirmar'); };
  const cerrarModal = () => { setModal(null); setEditando(null); setEliminando(null); setFormError(''); };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  /* ── Crear usuario ────────────────────────────────────────────────── */
  const handleCrear = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError('');
    try {
      await adminService.crearUsuario(form);
      showSuccess('Usuario creado correctamente.');
      cerrarModal();
      cargar();
    } catch (err) {
      setFormError(err.response?.data?.message ?? 'Error al crear el usuario.');
    } finally {
      setFormLoading(false);
    }
  };

  /* ── Editar usuario ───────────────────────────────────────────────── */
  const handleEditar = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError('');
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password; // No enviar si está vacío
      await adminService.editarUsuario(editando.id, payload);
      showSuccess('Usuario actualizado.');
      cerrarModal();
      cargar();
    } catch (err) {
      setFormError(err.response?.data?.message ?? 'Error al actualizar el usuario.');
    } finally {
      setFormLoading(false);
    }
  };

  /* ── Suspender / Reactivar cuenta (desde el modal de confirmación) ── */
  const handleSuspender = async () => {
    try {
      await adminService.toggleUsuario(eliminando.id);
      const nuevoEstado = !eliminando.activo;
      setUsuarios((prev) => prev.map((u) =>
        u.id === eliminando.id ? { ...u, activo: nuevoEstado } : u
      ));
      showSuccess(nuevoEstado ? 'Cuenta reactivada.' : 'Cuenta suspendida.');
      cerrarModal();
    } catch {
      setError('Error al cambiar el estado de la cuenta.');
      cerrarModal();
    }
  };

  /* ── Toggle activo (botón rápido en columna Estado) ──────────────── */
  const handleToggle = async (id) => {
    try {
      await adminService.toggleUsuario(id);
      setUsuarios((prev) => prev.map((u) => u.id === id ? { ...u, activo: !u.activo } : u));
    } catch {
      setError('Error al cambiar el estado del usuario.');
    }
  };

  /* ── Render ───────────────────────────────────────────────────────── */
  return (
    <div className="page-container">
      {/* Cabecera */}
      <div className="dashboard-header">
        <div>
          <h1>Gestión de Usuarios</h1>
          <p className={styles.subtitle}>
            {loading ? '...' : `${usuarios.length} usuario${usuarios.length !== 1 ? 's' : ''} encontrado${usuarios.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button id="btn-crear-usuario" className="btn-primary" onClick={abrirCrear}>
          + Nuevo Usuario
        </button>
      </div>

      {/* Mensajes */}
      {error   && <p className="error-msg" style={{ marginBottom: '1rem' }}>{error}</p>}
      {success && <p className={styles.successMsg}>{success}</p>}

      {/* Filtros */}
      <div className={styles.filtros}>
        <input
          id="busqueda-usuario"
          className={styles.searchInput}
          type="text"
          placeholder="🔍  Buscar por nombre o email..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select id="filtro-rol" className={styles.filterSelect} value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)}>
          <option value="">Todos los roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{ROL_BADGE[r]?.label ?? r}</option>)}
        </select>
        <select id="filtro-activo" className={styles.filterSelect} value={filtroActivo} onChange={(e) => setFiltroActivo(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>
        <button className="btn-secondary" onClick={cargar}>↺ Actualizar</button>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} />
          <p className="msg">Cargando usuarios...</p>
        </div>
      ) : usuarios.length === 0 ? (
        <div className={styles.empty}>
          <span>👤</span>
          <p>No se encontraron usuarios con los filtros actuales.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className="tabla">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Último acceso</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const rolInfo = getRolInfo(u);
                return (
                  <tr key={u.id} className={u.activo ? '' : styles.rowInactiva}>
                    <td className={styles.idCell}>#{u.id}</td>
                    <td>
                      <div className={styles.userCell}>
                        <span className={styles.avatar}>{u.nombre?.[0]}{u.apellido?.[0]}</span>
                        <div>
                          <strong>{u.nombre} {u.apellido}</strong>
                          {u.ubicacion && <small className={styles.ubicacion}>{u.ubicacion}</small>}
                        </div>
                      </div>
                    </td>
                    <td className={styles.emailCell}>{u.email}</td>
                    <td>
                      <div>
                        <span className={styles.rolBadge} style={{ '--badge-color': rolInfo.color }}>
                          {rolInfo.label}
                        </span>
                        {rolInfo.sub && (
                          <small className={styles.ubicacion} style={{ display: 'block', marginTop: '3px' }}>
                            🏢 {rolInfo.sub}
                          </small>
                        )}
                      </div>
                    </td>
                    <td>
                      <button
                        className={u.activo ? styles.toggleOn : styles.toggleOff}
                        onClick={() => handleToggle(u.id)}
                        title={u.activo ? 'Click para desactivar' : 'Click para activar'}
                      >
                        {u.activo ? '● Activo' : '○ Inactivo'}
                      </button>
                    </td>
                    <td className={styles.fechaCell}>
                      {u.ultimoAcceso
                        ? new Date(u.ultimoAcceso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
                        : '—'}
                    </td>
                    <td>
                      <div className={styles.accionesBtns}>
                        <button className="btn-small" onClick={() => abrirEditar(u)} title="Editar usuario">✏️ Editar</button>
                        <button
                          className={`btn-small ${u.activo ? 'btn-danger' : 'btn-ok'}`}
                          onClick={() => abrirConfirmar(u)}
                          title={u.activo ? 'Suspender cuenta' : 'Reactivar cuenta'}
                        >
                          {u.activo ? '🔒 Suspender' : '🔓 Reactivar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal Crear / Editar ─────────────────────────────────────── */}
      {(modal === 'crear' || modal === 'editar') && (
        <Modal title={modal === 'crear' ? '+ Nuevo Usuario' : '✏️ Editar Usuario'} onClose={cerrarModal}>
            <form onSubmit={modal === 'crear' ? handleCrear : handleEditar} className={styles.form}>
              {formError && <p className="error-msg">{formError}</p>}

              <div className={styles.formRow}>
                <div className="form-group">
                  <label>Nombre *</label>
                  <input name="nombre" value={form.nombre} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label>Apellido *</label>
                  <input name="apellido" value={form.apellido} onChange={handleChange} required />
                </div>
              </div>

              <div className="form-group">
                <label>Email *</label>
                <input name="email" type="email" value={form.email} onChange={handleChange} required />
              </div>

              <div className="form-group">
                <label>{modal === 'crear' ? 'Contraseña *' : 'Nueva contraseña (dejar vacío para no cambiar)'}</label>
                <input name="password" type="password" value={form.password} onChange={handleChange} required={modal === 'crear'} placeholder={modal === 'editar' ? '••••••••' : ''} />
              </div>

              <div className={styles.formRow}>
                <div className="form-group">
                  <label>Rol *</label>
                  <select name="rol" value={form.rol} onChange={handleChange} required>
                    {ROLES.map((r) => <option key={r} value={r}>{ROL_BADGE[r]?.label ?? r}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Teléfono</label>
                  <input name="telefono" value={form.telefono} onChange={handleChange} placeholder="+54 11 1234-5678" />
                </div>
              </div>

              <div className="form-group">
                <label>Ubicación</label>
                <input name="ubicacion" value={form.ubicacion} onChange={handleChange} placeholder="Ciudad, Provincia" />
              </div>

              {(form.rol === 'alumno' || form.rol === 'egresado') && (
                <div className="form-group">
                  <label>Legajo *</label>
                  <input
                    name="legajo"
                    value={form.legajo}
                    onChange={handleChange}
                    required
                    placeholder="Ej: 00457"
                  />
                </div>
              )}

              {modal === 'editar' && (
                <label className={styles.checkboxLabel}>
                  <input name="activo" type="checkbox" checked={form.activo} onChange={handleChange} />
                  <span>Cuenta activa</span>
                </label>
              )}

              <div className={styles.modalFooter}>
                <button type="button" className="btn-secondary" onClick={cerrarModal}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={formLoading}>
                  {formLoading ? 'Guardando...' : (modal === 'crear' ? 'Crear Usuario' : 'Guardar Cambios')}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {/* ── Modal Confirmar Suspender / Reactivar ────────────────────── */}
      {modal === 'confirmar' && eliminando && (
        <Modal
          onClose={cerrarModal}
          ariaLabel={eliminando.activo ? 'Suspender cuenta' : 'Reactivar cuenta'}
          className={styles.modalConfirm}
          maxWidth={420}
          style={{ padding: '2rem', textAlign: 'center' }}
        >
            <span className={styles.confirmIcon}>{eliminando.activo ? '🔒' : '🔓'}</span>
            <h2>{eliminando.activo ? 'Suspender cuenta' : 'Reactivar cuenta'}</h2>
            <p>
              {eliminando.activo ? (
                <>
                  La cuenta de <strong>{eliminando.nombre} {eliminando.apellido}</strong> ({eliminando.email}) quedará{' '}
                  <strong>inactiva</strong>. El usuario no podrá iniciar sesión. Los datos se conservan.
                </>
              ) : (
                <>
                  La cuenta de <strong>{eliminando.nombre} {eliminando.apellido}</strong> ({eliminando.email}) quedará{' '}
                  <strong>activa</strong> nuevamente y podrá iniciar sesión.
                </>
              )}
            </p>
            <div className={styles.modalFooter}>
              <button className="btn-secondary" onClick={cerrarModal}>Cancelar</button>
              <button
                className={eliminando.activo ? 'btn-danger' : 'btn-ok'}
                onClick={handleSuspender}
              >
                {eliminando.activo ? '🔒 Sí, suspender' : '🔓 Sí, reactivar'}
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}
