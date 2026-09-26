/**
 * AdminTopbar.jsx — barra superior clara del shell admin.
 *
 * Izquierda: hamburguesa (solo <1024px) + nombre de la sección actual.
 * No hay buscador global: no existe una API de búsqueda transversal y no se
 * muestra un control que no haga nada.
 * Derecha: campana (navega a /notificaciones, contador real, rojo si hay alta
 * prioridad) + menú de usuario.
 */

import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useNotifCounters } from '../../hooks/useNotifCounters';
import Brand from '../Brand/Brand';
import Icon from '../ui/Icon';
import UserMenu from '../Navbar/UserMenu';
import { seccionActual } from './adminNav';
import styles from './AdminShell.module.css';

export default function AdminTopbar({ toggleRef, drawerOpen, onToggleDrawer, onCloseDrawer }) {
  const { usuario } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { noLeidas, prioridadAlta } = useNotifCounters(usuario, { incluirChat: false });

  const enNotificaciones = location.pathname === '/notificaciones';
  const seccion = seccionActual(location.pathname);

  const bellTitle = noLeidas > 0
    ? `${noLeidas} notificación${noLeidas !== 1 ? 'es' : ''} sin leer`
    : 'Notificaciones';

  return (
    <header className={styles.topbar}>
      <div className={styles.topbarLeft}>
        <button
          ref={toggleRef}
          type="button"
          className={styles.menuToggle}
          onClick={onToggleDrawer}
          aria-label={drawerOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={drawerOpen}
          aria-controls="nav-mobile"
        >
          <Icon name={drawerOpen ? 'close' : 'menu'} size={22} />
        </button>

        <span className={styles.topbarBrand}>
          <Brand to="/" variant="compact" tone="dark" size={32} responsive onClick={onCloseDrawer} />
        </span>

        {seccion && (
          <p className={styles.crumbs}>
            <span className={styles.crumbRoot}>Administración</span>
            <Icon name="chevronRight" size={14} className={styles.crumbSep} />
            <span className={styles.crumbCurrent}>{seccion}</span>
          </p>
        )}
      </div>

      <div className={styles.topbarRight}>
        <button
          type="button"
          className={`${styles.bell} ${enNotificaciones ? styles.bellActive : ''}`}
          title={bellTitle}
          onClick={() => { onCloseDrawer(); navigate('/notificaciones'); }}
          aria-label="Notificaciones"
          aria-current={enNotificaciones ? 'page' : undefined}
        >
          <Icon name="bell" size={22} />
          {noLeidas > 0 && (
            <span className={`${styles.bellCount} ${prioridadAlta ? styles.bellCountAlta : ''}`}>
              {noLeidas > 9 ? '9+' : noLeidas}
            </span>
          )}
        </button>

        <span className={styles.topbarDivider} aria-hidden="true" />

        <UserMenu
          tone="light"
          mostrarRol
          noLeidas={noLeidas}
          prioridadAlta={prioridadAlta}
          onOpen={onCloseDrawer}
        />
      </div>
    </header>
  );
}
