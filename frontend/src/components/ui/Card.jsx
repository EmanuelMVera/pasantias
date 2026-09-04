/**
 * Card.jsx — Tarjeta de contenido estándar.
 *
 * Consolida la combinación repetida inline en las vistas públicas de perfil y
 * empresa: fondo de tarjeta, borde, radio, padding y sombra suave. Los valores
 * son los mismos que ya usaban esos bloques `style={{...}}`.
 *
 *   <Card>...</Card>
 *   <Card as="section" title="Contacto">...</Card>
 */

import styles from './Card.module.css';

export default function Card({
  as = 'div',
  title,
  className = '',
  bodyClassName = '',
  children,
  ...rest
}) {
  const cls = `${styles.card} ${className}`.trim();
  const inner = (
    <>
      {title && <h2 className={styles.title}>{title}</h2>}
      {bodyClassName ? <div className={bodyClassName}>{children}</div> : children}
    </>
  );

  return as === 'section'
    ? <section className={cls} {...rest}>{inner}</section>
    : <div className={cls} {...rest}>{inner}</div>;
}
