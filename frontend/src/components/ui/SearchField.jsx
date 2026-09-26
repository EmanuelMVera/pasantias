/**
 * SearchField.jsx — campo de búsqueda con <label> real (oculto visualmente por
 * defecto), placeholder y botón para borrar el texto.
 *
 *   <SearchField
 *     id="busqueda-empresa" label="Buscar empresas"
 *     placeholder="Buscar por empresa, CUIT o responsable…"
 *     value={texto} onChange={setTexto}
 *   />
 *
 * El componente es controlado; el debounce de la consulta lo hace quien lo usa
 * (ver hooks/useDebouncedValue).
 */

import styles from './SearchField.module.css';

export default function SearchField({ id, label, value, onChange, placeholder, maxLength = 100 }) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      <div className={styles.control}>
        <span className={styles.icono} aria-hidden="true">🔍</span>
        <input
          id={id}
          type="search"
          className={styles.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            className={styles.borrar}
            onClick={() => onChange('')}
            aria-label="Borrar búsqueda"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
