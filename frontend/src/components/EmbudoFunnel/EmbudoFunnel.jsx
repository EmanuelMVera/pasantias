/**
 * EmbudoFunnel.jsx — embudo de selección (CSS puro, sin librería de gráficos).
 *
 *   <EmbudoFunnel etapas={[{ key, label, valor }]} tasas={[{ key, label, valor }]} />
 *
 * - Cada barra es proporcional a su valor respecto del mayor de las etapas
 *   (centrada, forma de embudo). Una etapa con 0 se ve como una línea mínima.
 * - La leyenda muestra siempre número + etiqueta (el color nunca informa solo).
 * - `tasas` son las conversiones entre etapas que calcula el BACKEND: acá no se
 *   deriva ningún porcentaje nuevo.
 * - La figura es decorativa para lectores de pantalla (aria-hidden): la misma
 *   información está completa en la leyenda (lista) y en las tasas.
 */

import styles from './EmbudoFunnel.module.css';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('es-AR'));
const fmtPct = (n) => (n == null ? '—' : `${Number(n).toLocaleString('es-AR')}%`);

export default function EmbudoFunnel({ etapas, tasas = [] }) {
  const max = Math.max(...etapas.map((e) => e.valor ?? 0), 0);

  return (
    <div className={styles.wrap}>
      <div className={styles.funnel}>
        <div className={styles.figure} aria-hidden="true">
          {etapas.map((e, i) => {
            const ancho = max > 0 ? Math.max(((e.valor ?? 0) / max) * 100, 4) : 4;
            return (
              <div key={e.key} className={styles.row}>
                <div
                  className={`${styles.bar} ${styles[`bar${i}`] ?? ''}`}
                  style={{ '--ancho': `${ancho}%` }}
                />
              </div>
            );
          })}
        </div>

        <ol className={styles.legend}>
          {etapas.map((e, i) => (
            <li key={e.key} className={styles.legendItem}>
              <span className={`${styles.swatch} ${styles[`bar${i}`] ?? ''}`} aria-hidden="true" />
              <span className={styles.legendValue}>{fmt(e.valor)}</span>
              <span className={styles.legendLabel}>{e.label}</span>
            </li>
          ))}
        </ol>
      </div>

      {tasas.length > 0 && (
        <dl className={styles.tasas}>
          {tasas.map((t) => (
            <div key={t.key} className={styles.tasa}>
              <dt>{t.label}</dt>
              <dd>{fmtPct(t.valor)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
