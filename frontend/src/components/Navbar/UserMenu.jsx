/**
 * UserMenu.jsx — avatar + dropdown del usuario autenticado.
 *
 * Lo comparten el Navbar (alumno/egresado/empresa, fondo oscuro) y la topbar
 * del shell admin (fondo claro): `tone` elige el estilo del trigger.
 *
 * Contrato (e2e/responsive.spec.js):
 * - el trigger es un <button aria-haspopup="true"> (único en la página con ese
 *   valor) con `aria-expanded`;
 * - el dropdown es su HERMANO inmediato (no su hijo: no se anidan controles).
 *
 * Identidad: admin_empresa se muestra como la EMPRESA (logo + razón social);
 * el reclutador como PERSONA. Es solo visual: el backend decide permisos.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useEmpresa } from '../../hooks/useEmpresa';
import Avatar from '../Avatar/Avatar';
import Icon from '../ui/Icon';
import styles from './UserMenu.module.css';

const ROL_LEGIBLE = {
  admin: 'Administrador del sistema',
  alumno: 'Alumno',
  egresado: 'Egresado',
  empresa: 'Empresa',
};

export default function UserMenu({ tone = 'dark', noLeidas = 0, prioridadAlta = false, onOpen, mostrarRol = false }) {
  const { usuario, logout } = useAuth();
  const { empresa, esAdminEmpresa, esReclutador } = useEmpresa();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!usuario) return null;

  const handleLogout = async () => {
    setOpen(false);
    // Esperar a que se limpie la sesión ANTES de navegar: si no, `usuario`
    // sigue presente, AppRoutes rebota a la home del rol y esa página dispara
    // fetches que terminan en 401 → hard redirect a /login.
    await logout();
    navigate('/');
  };

  const esVistaEmpresaAdmin = usuario.rol === 'empresa' && esAdminEmpresa;
  const esVistaReclutador = usuario.rol === 'empresa' && esReclutador;

  const avatarSrc = esVistaEmpresaAdmin ? (empresa?.logo || null) : usuario.fotoPerfil;
  const avatarNombre = esVistaEmpresaAdmin ? (empresa?.razonSocial || usuario.nombre) : usuario.nombre;
  const avatarApellido = esVistaEmpresaAdmin ? '' : usuario.apellido;
  const nombrePrincipal = esVistaEmpresaAdmin ? (empresa?.razonSocial || usuario.nombre) : usuario.nombre;
  const nombreCompleto = `${usuario.nombre ?? ''} ${usuario.apellido ?? ''}`.trim();

  const rolLegible = esVistaEmpresaAdmin
    ? 'Administrador de empresa'
    : esVistaReclutador ? 'Reclutador' : (ROL_LEGIBLE[usuario.rol] ?? usuario.rol);

  const claro = tone === 'light';

  return (
    <div ref={ref} className={styles.wrap}>
      <button
        type="button"
        className={`${styles.trigger} ${claro ? styles.triggerLight : styles.triggerDark}`}
        onClick={() => { setOpen((v) => !v); onOpen?.(); }}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Menú de usuario: ${nombrePrincipal}`}
      >
        <Avatar
          src={avatarSrc}
          nombre={avatarNombre}
          apellido={avatarApellido}
          size={claro ? 36 : 30}
          style={claro ? { fontSize: '0.85rem' } : { fontSize: '0.82rem', border: '2px solid rgba(255, 255, 255, 0.3)' }}
        />
        <span className={styles.identity}>
          <span className={styles.name}>{claro ? (esVistaEmpresaAdmin ? nombrePrincipal : nombreCompleto) : nombrePrincipal}</span>
          {mostrarRol && <span className={styles.role}>{rolLegible}</span>}
        </span>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden="true">
          <Icon name="chevronDown" size={16} />
        </span>
      </button>

      {open && (
        <div className={styles.dropdown}>
          {esVistaEmpresaAdmin ? (
            <>
              <span className={styles.dropdownName}>{empresa?.razonSocial || 'Mi empresa'}</span>
              <span className={styles.dropdownInfo}>Responsable: {usuario.nombre} {usuario.apellido}</span>
              <span className={styles.dropdownEmail} title={usuario.email}>{usuario.email}</span>
            </>
          ) : esVistaReclutador ? (
            <>
              <span className={styles.dropdownName}>{nombreCompleto}</span>
              <span className={styles.dropdownEmail} title={usuario.email}>{usuario.email}</span>
              {empresa?.razonSocial && (
                <span className={styles.dropdownInfo}>
                  <Icon name="building" size={14} /> {empresa.razonSocial}
                </span>
              )}
            </>
          ) : (
            <>
              <span className={styles.dropdownName}>{nombreCompleto}</span>
              <span className={styles.dropdownEmail} title={usuario.email}>{usuario.email}</span>
            </>
          )}

          <span className={`${styles.dropdownRole} badge badge-${usuario.rol}`}>
            {esVistaEmpresaAdmin || esVistaReclutador ? rolLegible : usuario.rol}
          </span>

          {usuario.telefono && (
            <span className={styles.dropdownInfo}><Icon name="phone" size={14} /> {usuario.telefono}</span>
          )}
          {usuario.ubicacion && (
            <span className={styles.dropdownInfo}><Icon name="mapPin" size={14} /> {usuario.ubicacion}</span>
          )}

          <div className={styles.dropdownDivider} />

          {noLeidas > 0 && (
            <button
              type="button"
              className={styles.dropdownNotif}
              onClick={() => { setOpen(false); navigate('/notificaciones'); }}
            >
              <Icon name="bell" size={16} />
              {noLeidas} notificación{noLeidas !== 1 ? 'es' : ''} sin leer
              {prioridadAlta && <span className={styles.dropdownUrgente}>¡Urgente!</span>}
            </button>
          )}

          <button type="button" onClick={handleLogout} className={styles.dropdownLogout}>
            <Icon name="logout" size={16} />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
