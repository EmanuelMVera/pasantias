/**
 * ShellTopbar.jsx — barra superior clara del shell.
 *
 * Izquierda: hamburguesa (solo <1024px) + breadcrumb de la sección actual.
 * No hay buscador global: no existe una API de búsqueda transversal y no se
 * muestra un control que no haga nada.
 * Derecha: Chat (opcional, con mensajes sin leer) + campana (navega a
 * /notificaciones, contador real, rojo si hay alta prioridad) + menú de usuario.
 */

import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useNotifCounters } from '../../hooks/useNotifCounters';
import Brand from '../Brand/Brand';
import Icon from '../ui/Icon';
import UserMenu from '../Navbar/UserMenu';
import styles from './AppShell.module.css';

export default function ShellTopbar({
  toggleRef, crumbRoot, seccion, incluirChat = false, userMenuLinks,
  drawerOpen, onToggleDrawer, onCloseDrawer,
}) {
  const { usuario } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { noLeidas, prioridadAlta, mensajesNL } = useNotifCounters(usuario, { incluirChat });

  const enNotificaciones = location.pathname === '/notificaciones';
  const enChat = location.pathname === '/chat' || location.pathname.startsWith('/chat/');

  const bellTitle = noLeidas > 0
    ? `${noLeidas} notificación${noLeidas !== 1 ? 'es' : ''} sin leer`
    : 'Notificaciones';
  const chatTitle = mensajesNL > 0
    ? `${mensajesNL} mensaje${mensajesNL !== 1 ? 's' : ''} sin leer`
    : 'Chat';

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
            <span className={styles.crumbRoot}>{crumbRoot}</span>
            <Icon name="chevronRight" size={14} className={styles.crumbSep} />
            <span className={styles.crumbCurrent}>{seccion}</span>
          </p>
        )}
      </div>

      <div className={styles.topbarRight}>
        {incluirChat && (
          <Link
            to="/chat"
            className={`${styles.bell} ${enChat ? styles.bellActive : ''}`}
            title={chatTitle}
            aria-label="Chat"
            aria-current={enChat ? 'page' : undefined}
            onClick={onCloseDrawer}
          >
            <Icon name="message" size={22} />
            {mensajesNL > 0 && (
              <span className={styles.bellCount}>{mensajesNL > 9 ? '9+' : mensajesNL}</span>
            )}
          </Link>
        )}

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
          links={userMenuLinks}
        />
      </div>
    </header>
  );
}
