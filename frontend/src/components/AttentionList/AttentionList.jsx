import { Link } from 'react-router-dom';
import styles from './AttentionList.module.css';

/**
 * AttentionList.jsx — bloque compacto "Requieren atención" del dashboard.
 *
 * Solo informa y lleva a la página donde se resuelve cada cosa: no aprueba ni
 * rechaza nada desde acá (las acciones administrativas viven en su página).
 *
 *   <AttentionList items={[{ key, count, singular, plural, to, cta }]} />
 *
 * `count` null/undefined = todavía no se pudo obtener → se muestra "—".
 */
export default function AttentionList({ items }) {
  return (
    <ul className={styles.list}>
      {items.map(({ key, count, singular, plural, to, cta }) => {
        const conocido = count != null;
        const hay = conocido && count > 0;
        return (
          <li key={key} className={styles.item}>
            <div className={styles.info}>
              <span className={`${styles.count} ${hay ? styles.countActivo : ''}`}>{conocido ? count : '—'}</span>
              <span className={styles.label}>
                {conocido ? (count === 1 ? singular : plural) : plural}
                {!hay && conocido && <span className={styles.ok}> · sin pendientes</span>}
              </span>
            </div>
            {hay && (
              <Link to={to} className="btn-secondary btn-small">{cta}</Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
