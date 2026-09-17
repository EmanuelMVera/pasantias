/**
 * FilterBar.jsx — barra de filtros con resumen de filtros activos.
 *
 * `children` son los controles del filtro (selects/inputs propios de cada
 * página — no se estandarizan acá, cada pantalla sabe qué filtra). `chips`
 * es la lista de filtros actualmente aplicados, con su propio botón de
 * quitar — reusa las clases globales `.filter-chips`/`.filter-chip` que ya
 * usa EmpresaDashboardPage, ahora también disponibles para Admin.
 *
 *   <FilterBar
 *     chips={[{ key: 'estado', label: `Estado: ${estado}`, onRemove: () => setEstado('') }]}
 *     onClear={limpiarTodo}
 *   >
 *     <select ...>...</select>
 *   </FilterBar>
 */

export default function FilterBar({ children, chips = [], onClear }) {
  return (
    <div>
      <div className="filtros-form">{children}</div>
      {chips.length > 0 && (
        <div className="filter-chips">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="filter-chip is-active"
              onClick={chip.onRemove}
              aria-label={`Quitar filtro: ${chip.label}`}
            >
              {chip.label} ✕
            </button>
          ))}
          {onClear && chips.length > 1 && (
            <button type="button" className="filter-chip" onClick={onClear}>
              Limpiar todos
            </button>
          )}
        </div>
      )}
    </div>
  );
}
