/**
 * usePaginacion — SCALE-03.
 *
 * Estado de "página actual" que se resetea a 1 automáticamente cuando cambia
 * cualquiera de los filtros pasados en `deps` (para no quedar en la página 7
 * de un listado que ahora tiene 2 páginas).
 *
 * Uso:
 *   const { page, setPage } = usePaginacion([filtroRol, filtroActivo, busqueda]);
 */

import { useState, useEffect, useRef } from 'react';

export function usePaginacion(deps = []) {
  const [page, setPage] = useState(1);
  const montado = useRef(false);

  useEffect(() => {
    if (!montado.current) { montado.current = true; return; }
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { page, setPage };
}

export default usePaginacion;
