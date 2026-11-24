import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react';

// Mismas paletas que la app original (app.js · PAL). [color principal, color secundario]
export const PALETAS = {
  aji: ['#E4262B', '#FFC629'], limon: ['#2E8B1F', '#D4F23C'], mora: ['#8E2DE2', '#FF9BD2'],
  mango: ['#F26B0F', '#FFE066'], mar: ['#0E8A8A', '#9BF0E1'], choco: ['#6B3A1E', '#F4B860'],
  rosa: ['#E6007E', '#FFD1E8'], cielo: ['#1565D8', '#FFD43B'], vinotinto: ['#7A1230', '#FFFFFF'],
  blanconegro: ['#111111', '#FFFFFF'],
};

/** CSS de las variables --a/--a2 por paleta (lo que app.js escribía en <style id="ps">). */
export const paletasCss = Object.entries(PALETAS)
  .map(([k, [a, b]]) => `html[data-p=${k}]{--a:${a};--a2:${b}}`).join('');

function leer() {
  try {
    const t = JSON.parse(localStorage.getItem('tema') || '{}');
    return { p: PALETAS[t.p] ? t.p : 'aji', m: t.m === 'd' ? 'd' : 'l' };
  } catch { return { p: 'aji', m: 'l' }; }
}

/** Estado del tema (una sola instancia para toda la app la crea ThemeProvider). */
function useEstadoTema(activo = true) {
  const [tema, setTema] = useState(leer);

  useEffect(() => {
    if (!activo) return;
    const h = document.documentElement.dataset;
    h.p = tema.p;
    h.m = tema.m;
    try { localStorage.setItem('tema', JSON.stringify(tema)); } catch { /* almacenamiento bloqueado */ }
  }, [tema, activo]);

  const setPaleta = useCallback(p => { if (PALETAS[p]) setTema(t => ({ ...t, p })); }, []);
  const setModo = useCallback(m => setTema(t => ({ ...t, m: m === 'd' ? 'd' : 'l' })), []);
  return { paleta: tema.p, modo: tema.m, setPaleta, setModo };
}

const ThemeContext = createContext(/** @type {ReturnType<typeof useEstadoTema>|null} */ (null));

/** Un solo estado de tema compartido por toda la app. */
export function ThemeProvider({ children }) {
  return createElement(ThemeContext.Provider, { value: useEstadoTema() }, children);
}

/**
 * Paleta (data-p) y modo claro/oscuro (data-m) en <html>, recordados en localStorage.
 * Dentro de ThemeProvider usa el estado compartido; fuera, uno propio.
 */
export function useTheme() {
  const compartido = useContext(ThemeContext);
  const propio = useEstadoTema(!compartido);
  return compartido || propio;
}
