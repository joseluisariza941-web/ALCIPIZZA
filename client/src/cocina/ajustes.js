// Lógica pura de la pestaña Ajustes.

/**
 * Cambia la hora de abrir (j=0) o cerrar (j=1) del día i (0 = lunes). Vacío = cerrado (hh original).
 * @param {([number, number]|null)[]} h
 * @param {number} i
 * @param {0|1} j
 * @param {string} v
 * @returns {([number, number]|null)[]}
 */
export function fijarHora(h, i, j, v) {
  const r = h.map(x => (x ? [...x] : null));
  if (v === '') { r[i] = null; return r; }
  const x = r[i] || [18, 22];
  x[j] = +v;
  r[i] = /** @type {[number, number]} */ (x);
  return r;
}

/** Cantidad de mesas, mínimo 1. @param {string|number} v */
export const mesasValidas = v => Math.max(1, +v || 1);

/**
 * Cuerpo del PUT /api/metodos-pago/:codigo.
 * @param {{nombre:string, numero:string, activo:boolean}} m
 * @param {Partial<{nombre:string, numero:string, activo:boolean}>} cambio
 */
export const metodoBody = (m, cambio) => ({ nombre: m.nombre, numero: m.numero || '', activo: !!m.activo, ...cambio });
