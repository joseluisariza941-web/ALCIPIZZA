// Pantalla de bienvenida (splash original): logo + mensaje, se va sola o al tocarla.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** @type {Set<(s:{texto:string, ms:number})=>void>} */
const subs = new Set();
let visto = false;

/** Muestra el splash con un mensaje (p. ej. al iniciar sesión: mostrarSplash(config.w4, 2500)). */
export function mostrarSplash(texto, ms = 5000) {
  visto = true;
  subs.forEach(f => f({ texto, ms }));
}

/** El splash de bienvenida sale solo la primera vez que se abre la app. */
export function splashInicial(texto) { if (!visto) mostrarSplash(texto); }

/** Solo para pruebas. */
export function reiniciarSplash() { visto = false; }

/** @param {{ logo:string }} p */
export function Splash({ logo }) {
  const [s, setS] = useState(/** @type {{texto:string, ms:number, k:number}|null} */ (null));
  useEffect(() => {
    let k = 0;
    const f = x => setS({ ...x, k: ++k });
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  useEffect(() => {
    if (!s) return undefined;
    const t = setTimeout(() => setS(null), s.ms);
    return () => clearTimeout(t);
  }, [s]);
  if (!s) return null;
  return createPortal(
    <div id="sp" onClick={() => setS(null)}><div><img className="lg3" src={logo} alt="" /><p>{s.texto}</p></div></div>,
    document.body,
  );
}
