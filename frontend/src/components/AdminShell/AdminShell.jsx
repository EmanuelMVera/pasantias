/**
 * AdminShell.jsx — layout autenticado del ADMIN del sistema (/admin/*).
 *
 * Configura el shell genérico (components/AppShell: sidebar + topbar, rail y
 * drawer) con las secciones del administrador del sistema. Solo lo usa el rol
 * `admin` (ver `Chrome` en App.jsx). El administrador de EMPRESA tiene su
 * propio shell: components/EmpresaShell.
 */

import { useLocation } from 'react-router-dom';
import AppShell from '../AppShell/AppShell';
import { ADMIN_LINKS, seccionActual } from './adminNav';

const PIE = { icon: 'graduation', text: 'Sistema de gestión de pasantías y empleo' };

export default function AdminShell({ children }) {
  const { pathname } = useLocation();
  return (
    <AppShell
      links={ADMIN_LINKS}
      crumbRoot="Administración"
      seccion={seccionActual(pathname)}
      sidebarFooter={PIE}
    >
      {children}
    </AppShell>
  );
}
