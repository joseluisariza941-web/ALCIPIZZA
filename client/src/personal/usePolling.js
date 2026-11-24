import { useEffect, useRef } from 'react';

/**
 * Ejecuta fn al montar y luego cada `ms` milisegundos (la fase 6 lo cambia por tiempo real).
 * @param {() => any} fn @param {number} ms
 */
export function usePolling(fn, ms) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    ref.current();
    const t = setInterval(() => ref.current(), ms);
    return () => clearInterval(t);
  }, [ms]);
}
