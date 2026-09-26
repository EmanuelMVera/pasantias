/**
 * AdminShell.jsx — layout autenticado del ADMIN del sistema.
 *
 *   ┌──────────┬──────────────────────────────┐
 *   │          │ AdminTopbar (campana + user) │
 *   │ Sidebar  ├──────────────────────────────┤
 *   │          │ <main> contenido             │
 *   └──────────┴──────────────────────────────┘
 *
 * Responsive (breakpoints en AdminShell.module.css):
 *   ≥1280px     sidebar completa (ícono + texto)
 *   1024–1279   rail compacto (solo íconos; el texto queda para lectores de pantalla)
 *   <1024px     sin sidebar fija: drawer (#nav-mobile) que abre la hamburguesa
 *               de la topbar; se cierra con el botón, click afuera, Escape o
 *               al navegar, y bloquea el scroll del body mientras está abierto.
 *
 * Solo lo usa el rol admin (ver `Chrome` en App.jsx); el resto de los roles
 * sigue con el Navbar horizontal.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import AdminSidebar from './AdminSidebar';
import AdminTopbar from './AdminTopbar';
import styles from './AdminShell.module.css';

const MQ_DRAWER = '(max-width: 1023.98px)';

export default function AdminShell({ children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const toggleRef = useRef(null);
  const sidebarRef = useRef(null);

  const cerrarDrawer = useCallback((devolverFoco = false) => {
    setDrawerOpen(false);
    if (devolverFoco) toggleRef.current?.focus();
  }, []);

  // Drawer abierto: Escape, click afuera, foco al primer link y body sin scroll.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    sidebarRef.current?.querySelector('nav a')?.focus({ preventScroll: true });

    const onKey = (e) => { if (e.key === 'Escape') cerrarDrawer(true); };
    const onMouseDown = (e) => {
      if (sidebarRef.current?.contains(e.target) || toggleRef.current?.contains(e.target)) return;
      cerrarDrawer();
    };
    // Si la ventana crece a desktop con el drawer abierto, se cierra solo.
    const mq = window.matchMedia(MQ_DRAWER);
    const onMq = (e) => { if (!e.matches) cerrarDrawer(); };

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onMouseDown);
    mq.addEventListener('change', onMq);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onMouseDown);
      mq.removeEventListener('change', onMq);
      document.body.style.overflow = '';
    };
  }, [drawerOpen, cerrarDrawer]);

  return (
    <div className={styles.shell}>
      <AdminSidebar
        ref={sidebarRef}
        drawerOpen={drawerOpen}
        onNavigate={() => cerrarDrawer()}
      />
      {drawerOpen && <div className={styles.backdrop} aria-hidden="true" />}

      <div className={styles.column}>
        <AdminTopbar
          toggleRef={toggleRef}
          drawerOpen={drawerOpen}
          onToggleDrawer={() => setDrawerOpen((v) => !v)}
          onCloseDrawer={() => cerrarDrawer()}
        />
        {children}
      </div>
    </div>
  );
}
