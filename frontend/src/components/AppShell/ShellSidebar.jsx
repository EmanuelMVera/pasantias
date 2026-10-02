/**
 * ShellSidebar.jsx — navegación lateral del shell.
 *
 * Es el único `nav[aria-label="Principal"]` de la página. `aria-current="page"`
 * marca la sección activa: por defecto la ruta exacta (así en /notificaciones
 * ningún link queda activo: lo marca la campana); un link puede definir
 * `match(pathname)` para seguir activo en sus subrutas.
 * En el rail (1024–1279px) el texto se oculta visualmente pero sigue siendo el
 * nombre accesible del link; el `title` hace de tooltip.
 */

import { forwardRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Brand from '../Brand/Brand';
import Icon from '../ui/Icon';
import styles from './AppShell.module.css';

const ShellSidebar = forwardRef(function ShellSidebar({ links, header, footer, drawerOpen, onNavigate }, ref) {
  const { pathname } = useLocation();

  return (
    <aside
      ref={ref}
      id="nav-mobile"
      className={`${styles.sidebar} ${drawerOpen ? styles.sidebarOpen : ''}`}
    >
      <div className={styles.sidebarInner}>
        <div className={styles.sidebarBrand}>
          <span className={styles.brandFull}>
            <Brand to="/" variant="full" tone="light" size={38} plainTagline onClick={onNavigate} />
          </span>
          <span className={styles.brandMark}>
            <Brand to="/" variant="mark" tone="light" onClick={onNavigate} />
          </span>
        </div>

        {header}

        <nav className={styles.sidebarNav} aria-label="Principal">
          {links.map((l) => {
            const activo = l.match ? l.match(pathname) : (pathname === l.to || pathname === `${l.to}/`);
            return (
              <Link
                key={l.to}
                to={l.to}
                title={l.label}
                aria-current={activo ? 'page' : undefined}
                className={`${styles.navItem} ${activo ? styles.navItemActive : ''}`}
                onClick={onNavigate}
              >
                <Icon name={l.icon} size={20} className={styles.navIcon} />
                <span className={styles.navLabel}>{l.label}</span>
              </Link>
            );
          })}
        </nav>

        {footer && (
          <div className={styles.sidebarFooter}>
            <Icon name={footer.icon} size={18} className={styles.footerIcon} />
            <span className={styles.footerText}>{footer.text}</span>
          </div>
        )}
      </div>
    </aside>
  );
});

export default ShellSidebar;
