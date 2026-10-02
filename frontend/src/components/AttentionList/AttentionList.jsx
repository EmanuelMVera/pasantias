import { Link } from 'react-router-dom';
import Icon from '../ui/Icon';
import styles from './AttentionList.module.css';

/**
 * AttentionList.jsx — bloque compacto "Requieren atención" del dashboard.
 *
 * Solo informa y lleva a la página donde se resuelve cada cosa: no aprueba ni
 * rechaza nada desde acá (las acciones administrativas viven en su página).
 *
 *   <AttentionList items={[{ key, title, icon, tone, count, singular, plural, to, cta }]} />
 *
 * `count` null/undefined = todavía no se pudo obtener → se muestra "—".
 * El botón aparece solo si hay pendientes (count > 0).
 *
 * `hideZero`: no muestra las filas con count 0 (solo lo accionable). Si no
 * queda ninguna, muestra un estado positivo con `emptyText`.
 */
export default function AttentionList({ items, hideZero = false, emptyText = 'Todo al día: no hay nada pendiente.' }) {
  const visibles = hideZero ? items.filter((it) => it.count == null || it.count > 0) : items;

  if (hideZero && visibles.length === 0) {
    return (
      <p className={styles.alDia}>
        <span className={styles.alDiaIcon}><Icon name="checkCircle" size={22} /></span>
        {emptyText}
      </p>
    );
  }

  return (
    <ul className={styles.list}>
      {visibles.map(({ key, title, icon, tone = 'blue', count, singular, plural, to, cta }) => {
        const conocido = count != null;
        const hay = conocido && count > 0;
        return (
          <li key={key} className={styles.item}>
            {icon && (
              <span className={`${styles.icon} ${styles[`tone_${tone}`] ?? ''}`}>
                <Icon name={icon} size={20} />
              </span>
            )}
            <div className={styles.info}>
              {title && <span className={styles.title}>{title}</span>}
              <span className={styles.label}>
                {conocido ? `${count} ${count === 1 ? singular : plural}` : plural}
                {!hay && conocido && <span className={styles.ok}> · sin pendientes</span>}
              </span>
            </div>
            <span className={`${styles.count} ${hay ? styles.countActivo : ''}`}>
              {conocido ? count : '—'}
            </span>
            <span className={styles.cta}>
              {hay && <Link to={to} className="btn-secondary">{cta}</Link>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
