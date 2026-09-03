/**
 * useToast — Notificación efímera (patrón ya usado en PostulantesMiOfertaPage /
 * MiEmpresaPage, extraído a un hook reutilizable).
 *
 *   const { toast, showToast } = useToast();
 *   showToast('✓ Guardado');
 *   showToast('No se pudo enviar', 'error');
 *   ...
 *   <Toast toast={toast} />
 *
 * Devuelve `toast` = null | { msg, tone } y `showToast(msg, tone?)`.
 * Auto-descarta a los 3s y limpia el timer al desmontar.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export function useToast(duracion = 3000) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const showToast = useCallback((msg, tone = 'default') => {
    setToast({ msg, tone });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), duracion);
  }, [duracion]);

  const hideToast = useCallback(() => {
    clearTimeout(timer.current);
    setToast(null);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { toast, showToast, hideToast };
}

export default useToast;
