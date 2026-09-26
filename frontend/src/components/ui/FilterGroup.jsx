/**
 * FilterGroup.jsx — grupo rotulado de chips de filtro (un valor a la vez).
 *
 *   <FilterGroup
 *     label="Estado" idPrefix="filtro-estado"
 *     value={estado} onChange={setEstado}
 *     options={[{ value: '', label: 'Todas' }, { value: 'aprobada', label: 'Aprobada' }]}
 *   />
 *
 * Usa las clases globales `.filter-chip` / `.is-active` con `aria-pressed`, dentro
 * de un `role="group"` etiquetado. Cada chip tiene id `${idPrefix}-${value || 'todos'}`.
 */

import styles from './FilterGroup.module.css';

export default function FilterGroup({ label, options, value, onChange, idPrefix }) {
  return (
    <div className={styles.group} role="group" aria-label={`Filtrar por ${label.toLowerCase()}`}>
      <span className={styles.label} aria-hidden="true">{label}:</span>
      {options.map((op) => {
        const activo = value === op.value;
        return (
          <button
            key={op.value || 'todos'}
            type="button"
            id={idPrefix ? `${idPrefix}-${op.value || 'todos'}` : undefined}
            className={`filter-chip ${activo ? 'is-active' : ''}`}
            aria-pressed={activo}
            onClick={() => onChange(op.value)}
          >
            {op.label}
          </button>
        );
      })}
    </div>
  );
}
