/**
 * Button.jsx — Envoltorio fino sobre las clases globales `.btn-*` de globals.css.
 *
 * No introduce estilo visual nuevo: sólo mapea `variant` a la clase existente y
 * unifica detalles fáciles de olvidar (type="button" por defecto, estado
 * `loading`, poder renderizar un <Link> o un <a> con la misma apariencia).
 *
 *   <Button variant="primary" onClick={...}>Guardar</Button>
 *   <Button variant="secondary" to="/ruta">Ir</Button>
 *   <Button variant="small" href="cv.pdf" target="_blank">Ver CV</Button>
 */

import { Link } from 'react-router-dom';

const CLASES = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  small: 'btn-small',
  warn: 'btn-warn',
  ok: 'btn-ok',
  danger: 'btn-danger',
  back: 'btn-back',
};

export default function Button({
  variant = 'primary',
  to,
  href,
  loading = false,
  loadingText,
  disabled = false,
  className = '',
  type = 'button',
  children,
  ...rest
}) {
  const cls = `${CLASES[variant] || CLASES.primary} ${className}`.trim();
  const contenido = loading ? (loadingText || children) : children;

  if (to) {
    return (
      <Link to={to} className={cls} {...rest}>
        {contenido}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={cls} {...rest}>
        {contenido}
      </a>
    );
  }

  return (
    <button type={type} className={cls} disabled={disabled || loading} {...rest}>
      {contenido}
    </button>
  );
}
