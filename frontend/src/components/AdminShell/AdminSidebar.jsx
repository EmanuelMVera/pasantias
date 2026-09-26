/**
 * AdminSidebar.jsx — navegación lateral del admin.
 *
 * Es el único `nav[aria-label="Principal"]` de la página. Los NavLink usan
 * `end`, así `aria-current="page"` queda solo en la sección exacta (en
 * /notificaciones ningún link queda activo: lo marca la campana).
 * En el rail (1024–1279px) el texto se oculta visualmente pero sigue siendo el
 * nombre accesible del link; el `title` hace de tooltip.
 */

import { forwardRef } from 'react';
import { NavLink } from 'react-router-dom';
import Brand from '../Brand/Brand';
import Icon from '../ui/Icon';
import { ADMIN_LINKS } from './adminNav';
import styles from './AdminShell.module.css';

const AdminSidebar = forwardRef(function AdminSidebar({ drawerOpen, onNavigate }, ref) {
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

      <nav className={styles.sidebarNav} aria-label="Principal">
        {ADMIN_LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end
            title={l.label}
            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
            onClick={onNavigate}
          >
            <Icon name={l.icon} size={20} className={styles.navIcon} />
            <span className={styles.navLabel}>{l.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className={styles.sidebarFooter}>
        <Icon name="graduation" size={18} className={styles.footerIcon} />
        <span className={styles.footerText}>Sistema de gestión de pasantías y empleo</span>
      </div>
      </div>
    </aside>
  );
});

export default AdminSidebar;
