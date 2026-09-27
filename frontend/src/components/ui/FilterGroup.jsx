/**
 * FilterGroup.jsx — grupo rotulado de opciones de filtro (un valor a la vez),
 * presentado como control segmentado.
 *
 *   <FilterGroup
 *     label="Estado" idPrefix="filtro-estado"
 *     value={estado} onChange={setEstado}
 *     options={[{ value: '', label: 'Todas' }, { value: 'aprobada', label: 'Aprobada' }]}
 *   />
 *
 * Botones con `aria-pressed` dentro de un `role="group"` rotulado ("Filtrar por
 * <label>", o `ariaLabel` si se pasa). Cada opción tiene id
 * `${idPrefix}-${value || 'todos'}`. `hideLabel` oculta el rótulo visible.
 * `gridMobile`: en teléfonos (≤480px) las opciones se reparten en una grilla
 * de 2 columnas a todo el ancho (p. ej. 4 opciones → 2×2) en vez de envolverse
 * de forma despareja. En pantallas más anchas no cambia nada.
 */

import styles from './FilterGroup.module.css';

export default function FilterGroup({
  label, options, value, onChange, idPrefix, ariaLabel, hideLabel = false, gridMobile = false,
}) {
  return (
    <div
      className={`${styles.group} ${gridMobile ? styles.groupGrid : ''}`}
      role="group"
      aria-label={ariaLabel ?? `Filtrar por ${label.toLowerCase()}`}
    >
      {!hideLabel && <span className={styles.label} aria-hidden="true">{label}</span>}
      <div className={`${styles.segment} ${gridMobile ? styles.segmentGrid : ''}`}>
        {options.map((op) => {
          const activo = value === op.value;
          return (
            <button
              key={op.value || 'todos'}
              type="button"
              id={idPrefix ? `${idPrefix}-${op.value || 'todos'}` : undefined}
              className={`${styles.option} ${activo ? styles.optionActive : ''}`}
              aria-pressed={activo}
              onClick={() => onChange(op.value)}
            >
              {op.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
