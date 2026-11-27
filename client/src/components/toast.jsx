// Avisos breves (toast original). Uso: import { toast } from '../components/toast.jsx'; toast('Guardado').
// <ToastHost /> va montado dentro de <Shell>; si no hay ninguno montado, toast() crea el aviso directo en el body.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { emitirAlerta } from './Alertas.jsx';

const DURACION = 3500;
/** @type {Set<(t:string)=>void>} */
const hosts = new Set();
let seq = 0;

/** Muestra un aviso. Con el sistema de alertas montado lo muestra allí (tipo: exito|error|info|aviso). @param {string} texto @param {string} [tipo] */
export function toast(texto, tipo = 'info') {
  if (emitirAlerta(tipo, texto)) return;
  if (hosts.size) { hosts.forEach(f => f(texto)); return; }
  const e = document.createElement('div');
  e.className = 'toast';
  e.textContent = texto;
  document.body.append(e);
  setTimeout(() => e.remove(), DURACION);
}

/** Hook de conveniencia: const toast = useToast(); */
export const useToast = () => toast;

/** Contenedor de avisos (en el body, encima de las ventanas .md). */
export function ToastHost() {
  const [lista, setLista] = useState(/** @type {{id:number, t:string}[]} */ ([]));
  useEffect(() => {
    const timers = new Set();
    const mostrar = t => {
      const id = ++seq;
      setLista(l => [...l, { id, t }]);
      const tm = setTimeout(() => { timers.delete(tm); setLista(l => l.filter(x => x.id !== id)); }, DURACION);
      timers.add(tm);
    };
    hosts.add(mostrar);
    return () => { hosts.delete(mostrar); timers.forEach(clearTimeout); };
  }, []);
  return createPortal(lista.map(x => <div key={x.id} className="toast" role="status">{x.t}</div>), document.body);
}
