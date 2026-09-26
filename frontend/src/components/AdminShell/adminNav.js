/**
 * adminNav.js — secciones del área admin (sidebar + título de la topbar).
 * La ruta de auditoría sigue siendo /admin/logs.
 */

export const ADMIN_LINKS = [
  { to: '/admin', label: 'Panel', icon: 'home' },
  { to: '/admin/solicitudes', label: 'Solicitudes', icon: 'inbox' },
  { to: '/admin/empresas', label: 'Empresas', icon: 'building' },
  { to: '/admin/ofertas', label: 'Ofertas', icon: 'briefcase' },
  { to: '/admin/usuarios', label: 'Usuarios', icon: 'users' },
  { to: '/admin/importaciones', label: 'Importar', icon: 'upload' },
  { to: '/admin/logs', label: 'Auditoría', icon: 'history' },
];

const OTRAS_SECCIONES = [
  { prefijo: '/notificaciones', label: 'Notificaciones' },
  { prefijo: '/perfil/', label: 'Perfil de alumno' },
  { prefijo: '/empresa/', label: 'Perfil de empresa' },
];

/** Nombre de la sección actual para la topbar ('' si no se reconoce). */
export function seccionActual(pathname) {
  const exacta = ADMIN_LINKS.find((l) => l.to === pathname);
  if (exacta) return exacta.label;
  const admin = [...ADMIN_LINKS]
    .filter((l) => l.to !== '/admin')
    .find((l) => pathname.startsWith(`${l.to}/`));
  if (admin) return admin.label;
  return OTRAS_SECCIONES.find((s) => pathname.startsWith(s.prefijo))?.label ?? '';
}
