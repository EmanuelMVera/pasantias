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
 */

import styles from './FilterGroup.module.css';

export default function FilterGroup({ label, options, value, onChange, idPrefix, ariaLabel, hideLabel = false }) {
  return (
    <div className={styles.group} role="group" aria-label={ariaLabel ?? `Filtrar por ${label.toLowerCase()}`}>
      {!hideLabel && <span className={styles.label} aria-hidden="true">{label}</span>}
      <div className={styles.segment}>
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
