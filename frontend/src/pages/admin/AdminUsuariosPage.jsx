/**
 * AdminUsuariosPage.jsx — Gestión completa de usuarios del sistema.
 *
 * Permite al administrador:
 * - Ver los usuarios con filtros por rol, estado y búsqueda de texto (server-side)
 * - Crear nuevos usuarios con cualquier rol
 * - Editar datos, rol y estado de usuarios existentes
 * - Suspender / reactivar cuentas — SIEMPRE desde el botón de acción y con
 *   confirmación en un modal. El badge de estado de la tabla es solo informativo
 *   (no es un control): un click accidental sobre él no cambia nada.
 *
 * Tabla compacta en escritorio (sin columna de ID) y cards en tablet/móvil.
 *
 * Ruta: /admin/usuarios — rol: admin
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { adminService } from '../../services/admin.service';
import { useAuth } from '../../hooks/useAuth';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { usePaginacion } from '../../hooks/usePaginacion';
import { useToast } from '../../hooks/useToast';
import PageHeader from '../../components/ui/PageHeader';
import SearchField from '../../components/ui/SearchField';
import TableResponsive from '../../components/ui/TableResponsive';
import DataCard from '../../components/ui/DataCard';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmModal from '../../components/ui/ConfirmModal';
import Toast from '../../components/ui/Toast';
import Icon from '../../components/ui/Icon';
import Paginacion from '../../components/Paginacion/Paginacion';
import { BrandMark } from '../../components/Brand/Brand';
import UsuarioFormModal from '../../components/UsuarioFormModal/UsuarioFormModal';
import styles from './AdminUsuariosPage.module.css';
import { esEmailValido, esTelefonoValido, primerError } from '../../utils/validacion';

/* Roles disponibles en el sistema */
const ROLES = ['alumno', 'egresado', 'empresa', 'admin'];

/* Etiquetas y tonos (clases globales .badge-tone-*) para cada rol */
const ROL_BADGE = {
  alumno:   { label: 'Alumno',   tone: 'blue' },
  egresado: { label: 'Egresado', tone: 'violet' },
  empresa:  { label: 'Empresa',  tone: 'orange' },
  admin:    { label: 'Admin',    tone: 'red' },
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
 * Devuelve { label, sub, tone } para el badge de rol.
 * Para usuarios 'empresa' muestra el rolInterno (Administrador/Reclutador/etc.)
 * y el nombre de la empresa como subtexto.
 */
function getRolInfo(u) {
  if (u.rol === 'empresa' && u.membresiasEmpresa?.length > 0) {
    const mem      = u.membresiasEmpresa[0];
    const rolLabel = ROL_INTERNO_LABEL[mem.rolInterno] ?? mem.rolInterno;
    const empresa  = mem.empresa?.razonSocial ?? '';
    return { label: rolLabel, sub: empresa, tone: ROL_BADGE.empresa.tone };
  }
  const badge = ROL_BADGE[u.rol] ?? { label: u.rol, tone: 'gray' };
  return { label: badge.label, sub: '', tone: badge.tone };
}

const formatUltimoAcceso = (u) => (
  u.ultimoAcceso
    ? new Date(u.ultimoAcceso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
    : 'Nunca'
);

/* Estado inicial del formulario (crear/editar) */
/** Formato de email/teléfono antes de enviar (el backend valida igual). */
function errorFormUsuario(form) {
  if (!esEmailValido(form.email)) return 'El email no tiene un formato válido.';
  return primerError([
    [form.telefono, esTelefonoValido, 'El teléfono no es válido (solo números, espacios, +, paréntesis y guiones).'],
  ]);
}

const FORM_VACIO = {
  nombre: '', apellido: '', email: '',
  password: '', rol: 'alumno',
  telefono: '', ubicacion: '', activo: true,
  legajo: '',
};

/* Badge de estado: SOLO visual (span, sin onClick). El texto y el símbolo lo distinguen sin depender del color. */
function EstadoBadge({ activo }) {
  return (
    <span className={activo ? styles.estadoActivo : styles.estadoInactivo}>
      {activo ? '● Activo' : '○ Inactivo'}
    </span>
  );
}

function RolBadge({ info }) {
  return (
    <>
      <span className={`badge badge-tone-${info.tone}`}>{info.label}</span>
      {info.sub && <small className={styles.sub}>{info.sub}</small>}
    </>
  );
}

export default function AdminUsuariosPage() {
  const { usuario: yo } = useAuth();
  const esTabla = useMediaQuery('(min-width: 1024px)');
  const { toast, showToast } = useToast(4000);

  const [usuarios, setUsuarios] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  // Filtros
  const [texto,        setTexto]        = useState('');
  const [filtroRol,    setFiltroRol]    = useState('');
  const [filtroActivo, setFiltroActivo] = useState('');
  const q = useDebouncedValue(texto.trim(), 350);

  // Paginación (contrato común SCALE-03)
  const { page, setPage } = usePaginacion([filtroRol, filtroActivo, q]);
  const [pagination, setPagination] = useState(null);

  // Modales
  const [modal,       setModal]       = useState(null); // null | 'crear' | 'editar'
  const [editando,    setEditando]    = useState(null); // usuario a editar
  const [suspendiendo, setSuspendiendo] = useState(null); // usuario en el modal Suspender/Reactivar
  const [form,        setForm]        = useState(FORM_VACIO);
  const [formLoading, setFormLoading] = useState(false);
  const [formError,   setFormError]   = useState('');
  const [guardando,   setGuardando]   = useState(false);

  const secuencia = useRef(0);

  /* ── Carga de usuarios con filtros ────────────────────────────────── */
  const cargar = useCallback(async () => {
    const mia = ++secuencia.current;
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 25 };
      if (filtroRol)           params.rol    = filtroRol;
      if (filtroActivo !== '') params.activo = filtroActivo;
      if (q)                   params.q      = q;
      const res = await adminService.getUsuarios(params);
      if (mia !== secuencia.current) return;
      setUsuarios(res.data.data ?? res.data ?? []);
      setPagination(res.data.pagination ?? null);
    } catch {
      if (mia !== secuencia.current) return;
      setError('No se pudieron cargar los usuarios.');
    } finally {
      if (mia === secuencia.current) setLoading(false);
    }
  }, [filtroRol, filtroActivo, q, page]);

  useEffect(() => { cargar(); }, [cargar]);

  /* ── Helpers de UI ────────────────────────────────────────────────── */
  const abrirCrear = () => { setForm(FORM_VACIO); setFormError(''); setModal('crear'); };
  const abrirEditar = (u) => {
    setEditando(u);
    setForm({ nombre: u.nombre, apellido: u.apellido, email: u.email, password: '', rol: u.rol, telefono: u.telefono ?? '', ubicacion: u.ubicacion ?? '', activo: u.activo, legajo: u.perfil?.legajo ?? '' });
    setFormError('');
    setModal('editar');
  };
  const cerrarModal = () => { setModal(null); setEditando(null); setFormError(''); };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  /* ── Crear usuario ────────────────────────────────────────────────── */
  const handleCrear = async (e) => {
    e.preventDefault();
    const errorFormato = errorFormUsuario(form);
    if (errorFormato) { setFormError(errorFormato); return; }
    setFormLoading(true);
    setFormError('');
    try {
      await adminService.crearUsuario(form);
      showToast('Usuario creado correctamente.', 'success');
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
    const errorFormato = errorFormUsuario(form);
    if (errorFormato) { setFormError(errorFormato); return; }
    setFormLoading(true);
    setFormError('');
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password; // No enviar si está vacío
      await adminService.editarUsuario(editando.id, payload);
      showToast('Usuario actualizado.', 'success');
      cerrarModal();
      cargar();
    } catch (err) {
      setFormError(err.response?.data?.message ?? 'Error al actualizar el usuario.');
    } finally {
      setFormLoading(false);
    }
  };

  /* ── Suspender / Reactivar cuenta (único camino para cambiar el estado desde la tabla) ── */
  const handleSuspender = async () => {
    setGuardando(true);
    try {
      await adminService.toggleUsuario(suspendiendo.id);
      showToast(suspendiendo.activo ? 'Cuenta suspendida.' : 'Cuenta reactivada.', 'success');
      setSuspendiendo(null);
      cargar();
    } catch (err) {
      setSuspendiendo(null);
      setError(err.response?.data?.message ?? 'Error al cambiar el estado de la cuenta.');
    } finally {
      setGuardando(false);
    }
  };

  const hayFiltros = Boolean(q || filtroRol || filtroActivo !== '');
  const limpiarFiltros = () => { setTexto(''); setFiltroRol(''); setFiltroActivo(''); };

  const botonesAccion = (u) => {
    const propia = u.id === yo?.id;
    const nombre = `${u.nombre} ${u.apellido}`;
    return (
      <div className={styles.accionesBtns}>
        <button type="button" className="btn-small" onClick={() => abrirEditar(u)} aria-label={`Editar a ${nombre}`}>
          <Icon name="edit" size={15} />
          Editar
        </button>
        <button
          type="button"
          className={u.activo ? 'btn-danger' : 'btn-ok'}
          onClick={() => setSuspendiendo(u)}
          disabled={propia}
          aria-label={propia ? 'No podés suspender tu propia cuenta' : `${u.activo ? 'Suspender' : 'Reactivar'} la cuenta de ${nombre}`}
          title={propia ? 'No podés suspender tu propia cuenta' : undefined}
        >
          {u.activo ? 'Suspender' : 'Reactivar'}
        </button>
      </div>
    );
  };

  const total = pagination?.total ?? usuarios.length;
  const primeraCarga = loading && usuarios.length === 0 && !error;

  /* ── Render ───────────────────────────────────────────────────────── */
  return (
    <div className="page-container">
      <Toast toast={toast} />

      <PageHeader
        title="Gestión de usuarios"
        subtitle={loading && !pagination ? 'Cargando…' : `${total} usuario${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`}
        actions={(
          <div className={styles.headerAcciones}>
            <Link to="/admin/importaciones" className="btn-secondary">
              <Icon name="upload" size={18} />
              Importar CSV
            </Link>
            <button id="btn-crear-usuario" type="button" className="btn-primary" onClick={abrirCrear}>
              <Icon name="plus" size={18} strokeWidth={2.2} />
              Nuevo usuario
            </button>
          </div>
        )}
      />

      {error && <p className={`error-msg ${styles.error}`} role="alert">{error}</p>}

      {/* Filtros */}
      <div className={styles.filtros}>
        <SearchField
          id="busqueda-usuario"
          label="Buscar usuarios"
          placeholder="Buscar por nombre o email…"
          value={texto}
          onChange={setTexto}
        />
        <div className={styles.campo}>
          <label htmlFor="filtro-rol" className={styles.srOnly}>Rol</label>
          <select id="filtro-rol" value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)}>
            <option value="">Todos los roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROL_BADGE[r]?.label ?? r}</option>)}
          </select>
        </div>
        <div className={styles.campo}>
          <label htmlFor="filtro-activo" className={styles.srOnly}>Estado</label>
          <select id="filtro-activo" value={filtroActivo} onChange={(e) => setFiltroActivo(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </select>
        </div>
        <button type="button" className="btn-secondary" onClick={cargar} disabled={loading}>
          <Icon name="refresh" size={18} />
          Actualizar
        </button>
      </div>

      {primeraCarga ? (
        <p className="msg" role="status">Cargando usuarios...</p>
      ) : usuarios.length === 0 && !error ? (
        <EmptyState
          iconName="users"
          title={hayFiltros ? 'No se encontraron usuarios con los filtros actuales.' : 'Todavía no hay usuarios.'}
        >
          {hayFiltros && <button type="button" className="btn-secondary" onClick={limpiarFiltros}>Limpiar filtros</button>}
        </EmptyState>
      ) : usuarios.length > 0 && (
        <div className={loading ? styles.recargando : undefined} aria-busy={loading}>
          {esTabla ? (
            <TableResponsive minWidth={820}>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Último acceso</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className={styles.userCell}>
                        {u.rol === 'admin'
                          ? <BrandMark size={36} className={styles.avatarLogo} />
                          : <span className={styles.avatar} aria-hidden="true">{u.nombre?.[0]}{u.apellido?.[0]}</span>}
                        <div className="cell-break">
                          <strong className={u.activo ? undefined : styles.nombreInactivo}>{u.nombre} {u.apellido}</strong>
                          <small className={styles.sub}>{u.email}</small>
                          {u.ubicacion && <small className={styles.sub}>{u.ubicacion}</small>}
                        </div>
                      </div>
                    </td>
                    <td className="cell-break"><RolBadge info={getRolInfo(u)} /></td>
                    <td><EstadoBadge activo={u.activo} /></td>
                    <td className={styles.fecha}>{formatUltimoAcceso(u)}</td>
                    <td>{botonesAccion(u)}</td>
                  </tr>
                ))}
              </tbody>
            </TableResponsive>
          ) : (
            <div className={styles.cards}>
              {usuarios.map((u) => {
                const rol = getRolInfo(u);
                return (
                  <DataCard
                    key={u.id}
                    title={`${u.nombre} ${u.apellido}`}
                    subtitle={u.email}
                    badge={<EstadoBadge activo={u.activo} />}
                    fields={[
                      { label: 'Rol', value: <RolBadge info={rol} /> },
                      { label: 'Último acceso', value: formatUltimoAcceso(u) },
                      { label: 'Ubicación', value: u.ubicacion },
                    ]}
                    actions={botonesAccion(u)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {!primeraCarga && <Paginacion pagination={pagination} onPageChange={setPage} />}

      {/* ── Modal Crear / Editar ─────────────────────────────────────── */}
      {(modal === 'crear' || modal === 'editar') && (
        <UsuarioFormModal
          modo={modal}
          form={form}
          onChange={handleChange}
          onSubmit={modal === 'crear' ? handleCrear : handleEditar}
          onClose={cerrarModal}
          formError={formError}
          formLoading={formLoading}
          rolOptions={ROLES.map((r) => ({ value: r, label: ROL_BADGE[r]?.label ?? r }))}
          esPropia={modal === 'editar' && editando?.id === yo?.id}
        />
      )}

      {/* ── Modal Confirmar Suspender / Reactivar ────────────────────── */}
      {suspendiendo && (
        <ConfirmModal
          title={suspendiendo.activo ? 'Suspender cuenta' : 'Reactivar cuenta'}
          confirmLabel={suspendiendo.activo ? 'Suspender cuenta' : 'Reactivar cuenta'}
          tone={suspendiendo.activo ? 'danger' : 'ok'}
          busy={guardando}
          onConfirm={handleSuspender}
          onClose={() => setSuspendiendo(null)}
          confirmId="btn-confirmar-suspender"
        >
          <p>
            {suspendiendo.activo ? (
              <>
                La cuenta de <strong>{suspendiendo.nombre} {suspendiendo.apellido}</strong> ({suspendiendo.email}) quedará{' '}
                <strong>inactiva</strong>. El usuario no podrá iniciar sesión. Los datos se conservan.
              </>
            ) : (
              <>
                La cuenta de <strong>{suspendiendo.nombre} {suspendiendo.apellido}</strong> ({suspendiendo.email}) quedará{' '}
                <strong>activa</strong> nuevamente y podrá iniciar sesión.
              </>
            )}
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
