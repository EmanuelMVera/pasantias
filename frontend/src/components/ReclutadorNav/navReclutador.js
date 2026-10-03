/**
 * navReclutador.js — links y menú de usuario del Reclutador (lo usa ReclutadorNav.jsx).
 *
 * Principal: solo el trabajo operativo diario. Las consultas secundarias
 * (empresa, equipo, seguridad de la cuenta) van al menú de usuario.
 */

const empieza = (prefijo) => (pathname) => pathname === prefijo || pathname.startsWith(`${prefijo}/`);

export const RECLUTADOR_LINKS = [
  { to: '/empresa', label: 'Inicio', match: (p) => p === '/empresa' || p === '/empresa/' },
  {
    to: '/empresa/ofertas', label: 'Mis ofertas',
    // Crear/editar una oferta pertenece a "Mis ofertas".
    match: (p) => empieza('/empresa/ofertas')(p) || p === '/empresa/nueva-oferta',
  },
  {
    to: '/empresa/candidatos', label: 'Candidatos',
    // El proceso de una oferta (/empresa/postulantes/:id) pertenece a Candidatos.
    match: (p) => empieza('/empresa/candidatos')(p) || empieza('/empresa/postulantes')(p),
  },
];

/**
 * Accesos del menú de usuario. "Ver empresa" abre el perfil PÚBLICO de la
 * empresa (lo mismo que ve un alumno), no la pantalla de administración.
 */
export function menuUsuarioReclutador(empresaId) {
  return [
    ...(empresaId ? [{ to: `/empresa/${empresaId}`, label: 'Ver empresa', icon: 'building' }] : []),
    { to: '/empresa/equipo', label: 'Ver equipo', icon: 'users' },
    { to: '/empresa/seguridad', label: 'Seguridad de mi cuenta', icon: 'lock' },
  ];
}
