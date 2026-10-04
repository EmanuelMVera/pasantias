/**
 * navReclutador.js — links y menú de usuario del Reclutador (lo usa ReclutadorNav.jsx).
 *
 * Principal: solo el trabajo operativo diario. Las consultas secundarias
 * (empresa, seguridad de la cuenta) van al menú de usuario. El reclutador no
 * tiene sección Equipo: administrar integrantes es del administrador de empresa.
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
 * Accesos del menú de usuario. "Mi perfil" edita sus datos personales
 * (/empresa/mi-perfil). "Ver empresa" abre el perfil PÚBLICO de la
 * empresa (lo mismo que ve un alumno), no la pantalla de administración.
 */
export function menuUsuarioReclutador(empresaId) {
  return [
    { to: '/empresa/mi-perfil', label: 'Mi perfil', icon: 'user' },
    ...(empresaId ? [{ to: `/empresa/${empresaId}`, label: 'Ver empresa', icon: 'building' }] : []),
    { to: '/empresa/seguridad', label: 'Seguridad de mi cuenta', icon: 'lock' },
  ];
}
