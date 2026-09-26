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

import Icon from './Icon';
import styles from './SearchField.module.css';

export default function SearchField({ id, label, value, onChange, placeholder, maxLength = 100 }) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      <div className={styles.control}>
        <span className={styles.icono}><Icon name="search" size={18} /></span>
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
            <Icon name="close" size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
