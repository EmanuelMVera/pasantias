/**
 * empresaNav.js — secciones del Administrador de Empresa (sidebar + breadcrumb).
 *
 * Solo navegación de GOBIERNO de la empresa. Chat y Notificaciones son acciones
 * globales de la topbar; "Seguridad de mi cuenta" vive en el menú de usuario.
 * Crear/editar ofertas no aparece: es tarea del reclutador.
 */

const empieza = (prefijo) => (pathname) => pathname === prefijo || pathname.startsWith(`${prefijo}/`);

export const EMPRESA_LINKS = [
  { to: '/empresa', label: 'Resumen', icon: 'home' },
  { to: '/empresa/ofertas', label: 'Ofertas', icon: 'briefcase', match: empieza('/empresa/ofertas') },
  {
    to: '/empresa/candidatos', label: 'Candidatos', icon: 'users',
    // El detalle del proceso de una oferta (/empresa/postulantes/:id) pertenece a Candidatos.
    match: (p) => empieza('/empresa/candidatos')(p) || empieza('/empresa/postulantes')(p),
  },
  { to: '/empresa/equipo', label: 'Equipo', icon: 'userPlus', match: empieza('/empresa/equipo') },
  { to: '/empresa/mi-empresa', label: 'Mi empresa', icon: 'building', match: empieza('/empresa/mi-empresa') },
];

const OTRAS_SECCIONES = [
  { match: empieza('/empresa/seguridad'), label: 'Seguridad de mi cuenta' },
  { match: empieza('/chat'), label: 'Mensajes del equipo' },
  { match: empieza('/notificaciones'), label: 'Notificaciones' },
  { match: empieza('/perfil'), label: 'Perfil de candidato' },
  { match: empieza('/reclutador'), label: 'Perfil de reclutador' },
  { match: (p) => /^\/empresa\/\d+$/.test(p), label: 'Perfil público' },
];

/** Nombre de la sección actual para el breadcrumb ('' si no se reconoce). */
export function seccionEmpresa(pathname) {
  const link = EMPRESA_LINKS.find((l) => (l.match ? l.match(pathname) : pathname === l.to || pathname === `${l.to}/`));
  if (link) return link.label;
  return OTRAS_SECCIONES.find((s) => s.match(pathname))?.label ?? '';
}

export const EMPRESA_MENU_USUARIO = [
  { to: '/empresa/seguridad', label: 'Seguridad de mi cuenta', icon: 'lock' },
];
