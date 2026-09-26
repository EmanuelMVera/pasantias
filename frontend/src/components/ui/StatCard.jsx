/**
 * StatCard.jsx — tarjeta de métrica (KPI) reutilizable.
 *
 *   <StatCard iconName="users" tone="blue" label="Alumnos activos" value={120} />
 *   <StatCard iconName="inbox" tone="orange" label="Solicitudes pendientes" value={3}
 *             onClick={() => navigate('/admin/solicitudes')} actionHint="Ver solicitudes" />
 *
 * - `iconName`: ícono de ui/Icon dentro de un círculo tintado según `tone`
 *   (blue | green | teal | violet | orange | red | neutral).
 * - `onClick`: se renderiza como <button> (navegación/filtro) y muestra `actionHint`.
 * - `hint`: texto secundario debajo del valor (dato real, nunca tendencias inventadas).
 * - `loading`: skeleton en vez del valor.
 * - `compact`: variante más baja para filas de KPIs secundarios.
 * - Si la tarjeta queda angosta (<210px) el ícono pasa arriba del texto
 *   (container query), así la grilla puede tener muchas columnas sin apretar.
 */

import Icon from './Icon';
import styles from './StatCard.module.css';

export default function StatCard({
  iconName,
  tone = 'blue',
  label,
  value,
  hint,
  tooltip,
  onClick,
  actionHint,
  loading = false,
  compact = false,
}) {
  const clases = [
    styles.card,
    styles[`tone_${tone}`] ?? styles.tone_blue,
    compact ? styles.compact : '',
    onClick ? styles.clickable : '',
  ].filter(Boolean).join(' ');

  if (loading) {
    return (
      <div className={clases} aria-hidden="true">
        <div className={styles.skeleton} />
      </div>
    );
  }

  const contenido = (
    <span className={styles.inner}>
      {iconName && (
        <span className={styles.icon}>
          <Icon name={iconName} size={compact ? 20 : 22} />
        </span>
      )}
      <span className={styles.body}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{value == null ? '—' : value}</span>
        {hint && <span className={styles.hint}>{hint}</span>}
        {onClick && actionHint && (
          <span className={styles.action}>
            {actionHint} <Icon name="arrowRight" size={14} />
          </span>
        )}
      </span>
    </span>
  );

  return onClick
    ? <button type="button" onClick={onClick} className={clases} title={tooltip}>{contenido}</button>
    : <div className={clases} title={tooltip}>{contenido}</div>;
}
