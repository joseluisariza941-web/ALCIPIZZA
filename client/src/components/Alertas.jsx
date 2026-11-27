// Sistema de alertas: <AlertasProvider> + useAlertas() → { exito, error, info, aviso }.
// Sin proveedor montado, useAlertas() devuelve funciones que no hacen nada.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export const MAX_VISIBLES = 4;
export const DURACION = { exito: 4000, info: 4000, aviso: 5500, error: 7000 };
const ICONO = { exito: '✓', error: '!', info: 'i', aviso: '⚠' };

const SIN_PROVEEDOR = { exito: () => {}, error: () => {}, info: () => {}, aviso: () => {} };
const AlertasContext = createContext(SIN_PROVEEDOR);

/** Muestra una alerta desde código que no es un componente; devuelve false si no hay proveedor montado. */
let puente = /** @type {null | ((tipo:string, texto:string) => void)} */ (null);
export function emitirAlerta(tipo, texto) {
  if (!puente) return false;
  puente(tipo, texto);
  return true;
}

export const useAlertas = () => useContext(AlertasContext);

let seq = 0;

export function AlertasProvider({ children }) {
  const [lista, setLista] = useState(/** @type {{id:number, tipo:string, texto:string}[]} */ ([]));
  const timers = useRef(new Map());

  const cerrar = useCallback(id => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setLista(l => l.filter(a => a.id !== id));
  }, []);

  const mostrar = useCallback((tipo, texto) => {
    const t = String(texto ?? '').trim();
    if (!t) return;
    const id = ++seq;
    setLista(l => {
      const nueva = [...l, { id, tipo, texto: t }];
      const sobran = nueva.slice(0, Math.max(0, nueva.length - MAX_VISIBLES));
      sobran.forEach(a => { clearTimeout(timers.current.get(a.id)); timers.current.delete(a.id); });
      return nueva.slice(-MAX_VISIBLES);
    });
    timers.current.set(id, setTimeout(() => cerrar(id), DURACION[tipo] ?? DURACION.info));
  }, [cerrar]);

  useEffect(() => {
    puente = mostrar;
    const t = timers.current;
    return () => { if (puente === mostrar) puente = null; t.forEach(clearTimeout); t.clear(); };
  }, [mostrar]);

  const api = useMemo(() => ({
    exito: t => mostrar('exito', t), error: t => mostrar('error', t),
    info: t => mostrar('info', t), aviso: t => mostrar('aviso', t),
  }), [mostrar]);

  return (
    <AlertasContext.Provider value={api}>
      {children}
      <div className="alertas" aria-live="polite" data-testid="alertas">
        {lista.map(a => (
          <div key={a.id} className={`alerta alerta-${a.tipo}`} role={a.tipo === 'error' ? 'alert' : 'status'}>
            <span className="alerta-i" aria-hidden="true">{ICONO[a.tipo]}</span>
            <span className="alerta-t">{a.texto}</span>
            <button type="button" className="alerta-x" aria-label="Cerrar alerta" onClick={() => cerrar(a.id)}>×</button>
          </div>
        ))}
      </div>
    </AlertasContext.Provider>
  );
}
