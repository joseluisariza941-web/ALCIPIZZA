// Formatos visibles iguales a la app original.

/** Pesos colombianos sin decimales: 28000 → "$28.000". @param {number} n */
export const pesos = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');

/** Fecha y hora corta como fd() original. @param {string|number|Date} t */
export const fechaHora = t => new Date(t).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Fecha larga ("23 de noviembre de 2026"). @param {string|number|Date} t */
export const fechaLarga = t => new Date(t).toLocaleDateString('es-CO', { dateStyle: 'long' });
