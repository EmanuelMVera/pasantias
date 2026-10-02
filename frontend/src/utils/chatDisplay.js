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

const nombrePersona = (usuario) => `${usuario?.nombre ?? ''} ${usuario?.apellido ?? ''}`.trim();

/**
 * Título y subtítulo del interlocutor para el encabezado de la conversación:
 *   admin_empresa → "Delta Innovación IT" / "Responsable: Carolina Méndez"
 *   reclutador    → "Diego Herrera" / "Reclutador · Delta Innovación IT"
 *   resto         → nombre / email (si vino)
 */
export function displayEncabezado(usuario) {
  const persona = nombrePersona(usuario);
  if (usuario?.rolInterno === 'admin_empresa' && usuario?.razonSocial) {
    return { titulo: usuario.razonSocial, subtitulo: persona ? `Responsable: ${persona}` : '' };
  }
  if (usuario?.rolInterno === 'reclutador') {
    return {
      titulo: persona || 'Usuario',
      subtitulo: usuario?.razonSocial ? `Reclutador · ${usuario.razonSocial}` : 'Reclutador',
    };
  }
  return { titulo: persona || 'Usuario', subtitulo: usuario?.email ?? '' };
}

/**
 * Destino del botón de perfil del interlocutor. Un usuario con rol global
 * `empresa` puede ser la cuenta administradora (representa a la ENTIDAD → perfil
 * de la empresa) o un reclutador (una PERSONA → su ficha): se distingue por
 * `rolInterno`, nunca solo por `rol`.
 *
 * @returns {{ url: string, label: string } | null} null si no hay datos suficientes.
 */
export function perfilDestino(usuario) {
  if (!usuario?.id) return null;
  if (usuario.rol === 'alumno' || usuario.rol === 'egresado') {
    return { url: `/perfil/${usuario.id}`, label: 'Ver perfil' };
  }
  if (usuario.rol === 'empresa') {
    if (usuario.rolInterno === 'admin_empresa') {
      return usuario.empresaId ? { url: `/empresa/${usuario.empresaId}`, label: 'Ver empresa' } : null;
    }
    if (usuario.rolInterno === 'reclutador') {
      return { url: `/reclutador/${usuario.id}`, label: 'Ver perfil' };
    }
  }
  return null;
}

/** src/nombre/apellido para el Avatar, con el mismo criterio institucional. */
export function displayAvatarProps(usuario) {
  if (usuario?.rolInterno === 'admin_empresa') {
    return { src: usuario?.logo || null, nombre: usuario?.razonSocial || usuario?.nombre, apellido: '' };
  }
  return { src: usuario?.fotoPerfil, nombre: usuario?.nombre, apellido: usuario?.apellido };
}
