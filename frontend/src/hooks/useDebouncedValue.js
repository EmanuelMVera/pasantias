/**
 * useDebouncedValue — devuelve `value` recién después de `delay` ms sin cambios.
 * Sirve para no disparar una consulta al servidor por cada tecla de un buscador.
 *
 *   const [texto, setTexto] = useState('');
 *   const q = useDebouncedValue(texto, 350);   // usar `q` en la consulta
 */
import { useEffect, useState } from 'react';

export function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

export default useDebouncedValue;
