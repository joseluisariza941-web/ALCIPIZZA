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

export const MAX_QR = 700000;
/** ¿La imagen del QR cabe en el límite de la API? @param {string} s */
export const qrCabe = s => s.length <= MAX_QR;

const ent = (v, min, max = Infinity) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));

/**
 * Cuerpo del PUT /api/config: sin logo ni fondo, mesas mínimo 1 y ajustes de puntos como enteros.
 * @param {any} f
 */
export function configBody(f) {
  const { logo, bg, ...r } = f;
  const b = { ...r, mesas: mesasValidas(f.mesas) };
  if ('puntosPorMil' in b) b.puntosPorMil = ent(b.puntosPorMil, 0, 1000);
  if ('puntosCanje' in b) b.puntosCanje = ent(b.puntosCanje, 1);
  if ('descuentoCanje' in b) b.descuentoCanje = ent(b.descuentoCanje, 0);
  return b;
}
