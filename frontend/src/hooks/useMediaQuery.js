/**
 * useMediaQuery — Suscribe un componente a un media query y devuelve si matchea.
 *
 * Uso: const esMovil = useMediaQuery('(max-width: 900px)');
 *
 * Implementado con useSyncExternalStore: sin estado local ni efectos, SSR-safe
 * (devuelve false cuando no hay window).
 */
import { useCallback, useSyncExternalStore } from 'react';

export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
      }
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false;

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export default useMediaQuery;
