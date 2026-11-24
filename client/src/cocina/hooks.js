import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

/**
 * Carga un recurso GET y permite recargarlo.
 * @template T
 * @param {string|null} path
 * @param {T} inicial
 * @returns {{ data: T, cargando: boolean, error: Error|null, recargar: () => Promise<void>, setData: (d:T)=>void }}
 */
export function useCarga(path, inicial) {
  const [data, setData] = useState(inicial);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(/** @type {Error|null} */ (null));
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);
  const recargar = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api.get(path);
      if (vivo.current) { setData(d); setError(null); }
    } catch (e) { if (vivo.current) setError(/** @type {Error} */ (e)); }
    finally { if (vivo.current) setCargando(false); }
  }, [path]);
  useEffect(() => { recargar(); }, [recargar]);
  return { data, cargando, error, recargar, setData };
}
