/**
 * Card.jsx — Tarjeta de contenido estándar (superficie blanca, borde suave).
 *
 *   <Card>...</Card>
 *   <Card as="section" title="Contacto">...</Card>
 *   <Card as="section" title="Actividad del período" subtitle="…"
 *         actions={<Segmented .../>} headingLevel={2}>...</Card>
 *
 * Con `subtitle` o `actions` el título pasa a un header con las acciones a la
 * derecha (en móvil bajan debajo). `titleId` permite usar la card como región
 * rotulada (`aria-labelledby`).
 */

import styles from './Card.module.css';

export default function Card({
  as = 'div',
  title,
  subtitle,
  actions,
  titleId,
  headingLevel = 2,
  className = '',
  bodyClassName = '',
  children,
  ...rest
}) {
  const Tag = as === 'section' ? 'section' : 'div';
  const H = headingLevel === 3 ? 'h3' : 'h2';
  const cls = `${styles.card} ${className}`.trim();
  const conHeader = subtitle || actions;

  return (
    <Tag className={cls} aria-labelledby={titleId} {...rest}>
      {conHeader ? (
        <div className={styles.header}>
          <div className={styles.headText}>
            {title && <H id={titleId} className={styles.title}>{title}</H>}
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      ) : (
        title && <H id={titleId} className={styles.title}>{title}</H>
      )}
      {bodyClassName ? <div className={bodyClassName}>{children}</div> : children}
    </Tag>
  );
}
