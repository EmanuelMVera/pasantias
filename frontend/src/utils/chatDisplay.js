/** Formatea hora para mostrar en burbuja de mensaje / lista de conversaciones */
export function formatHora(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Identidad a mostrar para un interlocutor de chat, coherente con Navbar.jsx:
 * admin_empresa → identidad institucional (razón social primero); reclutador
 * → persona, con la empresa como contexto secundario; el resto, su nombre.
 */
export function displayNombre(usuario) {
  const nombre = `${usuario?.nombre ?? ''} ${usuario?.apellido ?? ''}`.trim() || 'Usuario';
  if (usuario?.rolInterno === 'admin_empresa' && usuario?.razonSocial) return usuario.razonSocial;
  if (usuario?.razonSocial) return `${nombre} — ${usuario.razonSocial}`;
  return nombre;
}

/** src/nombre/apellido para el Avatar, con el mismo criterio institucional. */
export function displayAvatarProps(usuario) {
  if (usuario?.rolInterno === 'admin_empresa') {
    return { src: usuario?.logo || null, nombre: usuario?.razonSocial || usuario?.nombre, apellido: '' };
  }
  return { src: usuario?.fotoPerfil, nombre: usuario?.nombre, apellido: usuario?.apellido };
}
