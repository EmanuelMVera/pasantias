/**
 * TableResponsive.jsx — Tabla con scroll horizontal contenido.
 *
 * Envuelve una `<table className="tabla">` en `.table-wrap` (globals.css) para
 * que las tablas anchas de los paneles de admin/empresa scrolleen dentro de su
 * tarjeta en vez de desbordar la página. Reemplaza los wrappers `overflow-x`
 * ad hoc e inline repartidos por esas vistas.
 *
 *   <TableResponsive>
 *     <thead>...</thead>
 *     <tbody>...</tbody>
 *   </TableResponsive>
 */

export default function TableResponsive({
  minWidth,
  className = '',
  wrapClassName = '',
  children,
  ...rest
}) {
  return (
    <div className={`table-wrap ${wrapClassName}`.trim()}>
      <table
        className={`tabla ${className}`.trim()}
        style={minWidth ? { minWidth } : undefined}
        {...rest}
      >
        {children}
      </table>
    </div>
  );
}
