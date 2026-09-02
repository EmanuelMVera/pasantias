/**
 * rutas.js — Lógica de navegación compartida entre App.jsx y las páginas.
 *
 * Se extrae acá (y no en App.jsx) para que LoginPage y otros consumidores la
 * importen sin crear un ciclo de imports con el componente raíz.
 */

// Roles de sistema válidos. Fuera de este set no hay una home a la que redirigir
// (evita el loop / ⇄ /dashboard si el backend devolviera un rol inesperado).
export const ROLES_VALIDOS = ['admin', 'empresa', 'alumno', 'egresado'];

/**
 * Obtiene la ruta de inicio según el rol del usuario.
 * Única fuente de verdad para la redirección post-login y la de la ruta raíz.
 * @param {string} rol - Rol del usuario autenticado
 * @returns {string} Ruta de redirección
 */
export function getRutaInicio(rol) {
  switch (rol) {
    case 'admin':    return '/admin';
    case 'empresa':  return '/empresa';
    case 'alumno':
    case 'egresado':
    default:         return '/dashboard';
  }
}
