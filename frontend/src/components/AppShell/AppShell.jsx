/**
 * AppShell.jsx — layout autenticado genérico: sidebar oscura + topbar clara.
 *
 *   ┌──────────┬──────────────────────────────┐
 *   │          │ ShellTopbar (chat/campana/user)│
 *   │ Sidebar  ├──────────────────────────────┤
 *   │          │ <main> contenido             │
 *   └──────────┴──────────────────────────────┘
 *
 * Lo configuran dos shells concretos (no se usa directo):
 *   - components/AdminShell   → Administrador del Sistema (/admin/*)
 *   - components/EmpresaShell → Administrador de Empresa (/empresa/*)
 * Cada uno aporta sus links, el nombre raíz del breadcrumb y, si quiere, una
 * cabecera/pie de sidebar. El comportamiento es el mismo para ambos.
 *
 * Responsive (breakpoints en AppShell.module.css):
 *   ≥1280px     sidebar completa (ícono + texto)
 *   1024–1279   rail compacto (solo íconos; el texto queda para lectores de pantalla)
 *   <1024px     sin sidebar fija: drawer (#nav-mobile) que abre la hamburguesa
 *               de la topbar; se cierra con el botón, click afuera, Escape o
 *               al navegar, y bloquea el scroll del body mientras está abierto.
 *
 * Props:
 *   links          [{ to, label, icon, match? }] — `match(pathname)` opcional
 *                  para marcar activo el link en subrutas; sin él, activo =
 *                  ruta exacta.
 *   crumbRoot      texto raíz del breadcrumb ("Administración", "Empresa").
 *   seccion        nombre de la sección actual ('' = sin breadcrumb).
 *   incluirChat    muestra el acceso a Chat con su contador en la topbar.
 *   sidebarHeader  nodo opcional debajo de la marca (identidad de la empresa).
 *   sidebarFooter  { icon, text } del pie de la sidebar.
 *   userMenuLinks  links extra del menú de usuario.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import ShellSidebar from './ShellSidebar';
import ShellTopbar from './ShellTopbar';
import styles from './AppShell.module.css';

const MQ_DRAWER = '(max-width: 1023.98px)';

export default function AppShell({
  links,
  crumbRoot,
  seccion,
  incluirChat = false,
  sidebarHeader = null,
  sidebarFooter,
  userMenuLinks,
  children,
}) {
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
      <ShellSidebar
        ref={sidebarRef}
        links={links}
        header={sidebarHeader}
        footer={sidebarFooter}
        drawerOpen={drawerOpen}
        onNavigate={() => cerrarDrawer()}
      />
      {drawerOpen && <div className={styles.backdrop} aria-hidden="true" />}

      <div className={styles.column}>
        <ShellTopbar
          toggleRef={toggleRef}
          crumbRoot={crumbRoot}
          seccion={seccion}
          incluirChat={incluirChat}
          userMenuLinks={userMenuLinks}
          drawerOpen={drawerOpen}
          onToggleDrawer={() => setDrawerOpen((v) => !v)}
          onCloseDrawer={() => cerrarDrawer()}
        />
        {children}
      </div>
    </div>
  );
}
