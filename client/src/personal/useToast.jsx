import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Aviso flotante como toast() original (clase .toast, 3,5 s).
 * @returns {{ toast: import('react').ReactNode, aviso: (texto:string) => void }}
 */
export function useToast() {
  const [texto, setTexto] = useState('');
  const t = useRef(/** @type {any} */ (null));
  const aviso = useCallback(msg => {
    clearTimeout(t.current);
    setTexto(msg);
    t.current = setTimeout(() => setTexto(''), 3500);
  }, []);
  useEffect(() => () => clearTimeout(t.current), []);
  return { toast: texto ? <div className="toast" role="status">{texto}</div> : null, aviso };
}
