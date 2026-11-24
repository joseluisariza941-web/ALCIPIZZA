// Formatos compartidos (mismos que app.js original: $$, fd, h12).

/** Pesos colombianos sin decimales: 28000 → "$28.000". @param {number} n */
export const pesos = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');

/** Fecha corta "05 mar., 07:07 p. m." como fd() original. @param {string|number|Date} t */
export const fechaCorta = t => new Date(t).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Hora decimal a 12 h: 18.5 → "6:30 pm". @param {number} n */
export const h12 = n => {
  const h = Math.floor(n);
  return (h % 12 || 12) + ':' + String(Math.round((n - h) * 60)).padStart(2, '0') + (h < 12 ? ' am' : ' pm');
};

/**
 * Precio de un ítem de pedido de la API. `precioUnitario` ya incluye variante + extras
 * (lo calcula el servidor, ver docs/API.md), así que no se vuelven a sumar.
 * @param {{ precioUnitario:number }} c
 */
export const precioItem = c => c.precioUnitario || 0;
