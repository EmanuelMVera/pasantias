/**
 * Avatar.jsx — Avatar circular reutilizable (FE-01).
 *
 * Centraliza el patrón repetido en Navbar, EquipoPage, ChatPage,
 * PostulantesMiOfertaPage, CandidatosEmpresaPage y PerfilPublicoPage:
 * foto de perfil con fallback a la inicial del nombre si no hay `src`,
 * y fallback también si la imagen falla al cargar (onError).
 *
 * Todo el tamaño/color por defecto se aplica inline (no vía CSS module):
 * así `className`/`style` solo pueden *sumar* detalles propios de cada
 * pantalla (ej. el borde del avatar del Navbar) sin arriesgarse a perder
 * contra ellos por orden de carga de hojas de estilo — nunca imponen un
 * tamaño rígido que un caller no pueda ajustar.
 *
 * `size`: número en px para un tamaño puntual, o uno de los tokens
 * 'sm' | 'md' | 'lg' (28 / 40 / 64px) para los casos nuevos que no
 * necesiten un valor exacto.
 */

import { useState } from 'react';

const SIZE_TOKENS = { sm: 28, md: 40, lg: 64 };

export default function Avatar({
  src,
  nombre,
  apellido,
  size = 'md',
  color,
  className = '',
  style,
  imgClassName = '',
}) {
  // El error se recuerda POR URL: si la foto/logo cambia (p. ej. tras subir una
  // nueva), se vuelve a intentar aunque la anterior hubiera fallado.
  const [srcConError, setSrcConError] = useState(null);

  const nombreCompleto = `${nombre ?? ''} ${apellido ?? ''}`.trim() || 'Usuario';
  const inicial = (nombre?.[0] ?? apellido?.[0] ?? '?').toUpperCase();
  const sizePx = typeof size === 'number' ? size : SIZE_TOKENS[size] ?? SIZE_TOKENS.md;

  const containerStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: '50%',
    background: color || 'var(--primary)',
    color: '#fff',
    fontWeight: 700,
    userSelect: 'none',
    width: sizePx,
    height: sizePx,
    fontSize: sizePx * 0.4,
    ...style,
  };

  const mostrarImagen = Boolean(src) && srcConError !== src;

  return (
    <div className={className} style={containerStyle} role="img" aria-label={nombreCompleto}>
      {mostrarImagen ? (
        <img
          src={src}
          alt=""
          className={imgClassName}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={() => setSrcConError(src)}
        />
      ) : (
        <span aria-hidden="true">{inicial}</span>
      )}
    </div>
  );
}
