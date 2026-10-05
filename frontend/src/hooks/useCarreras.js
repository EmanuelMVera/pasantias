/**
 * useCarreras — catálogo institucional de carreras (GET /api/catalogos/carreras).
 *
 *   const { carreras, cargando, error } = useCarreras();
 *
 * Una sola petición por sesión: el resultado se cachea en memoria del módulo
 * (la lista solo cambia con un deploy). La usan Solicitud de empresa y
 * Crear/Editar oferta; el backend valida contra el mismo catálogo.
 */
import { useEffect, useState } from 'react';
import { catalogoService } from '../services/catalogo.service';

let cache = null;
let pedido = null;

function cargarCarreras() {
  if (cache) return Promise.resolve(cache);
  if (!pedido) {
    pedido = catalogoService.getCarreras()
      .then(({ data }) => { cache = data.data ?? []; return cache; })
      .finally(() => { pedido = null; });
  }
  return pedido;
}

export function useCarreras() {
  const [carreras, setCarreras] = useState(cache ?? []);
  const [cargando, setCargando] = useState(!cache);
  const [error, setError] = useState('');

  useEffect(() => {
    if (cache) return undefined;
    let vigente = true;
    cargarCarreras()
      .then((lista) => { if (vigente) setCarreras(lista); })
      .catch(() => { if (vigente) setError('No se pudo cargar el catálogo de carreras.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, []);

  return { carreras, cargando, error };
}

export default useCarreras;
