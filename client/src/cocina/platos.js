// Lógica pura de Comidas (platos) y Extras.
import { isBebida } from './util.js';
import { unidadesCompatibles } from './unidades.js';

const porNombre = (insumos, n) => insumos.find(x => x.nombre.trim().toLowerCase() === String(n).trim().toLowerCase());

/** Ids de los extras ofrecidos por un plato (acepta objetos Extra o ids). */
export const idsExtras = p => (p?.extras || []).map(e => (typeof e === 'object' ? e.id : e));

/** Texto de la píldora de un ingrediente (ipl original). */
export const pillIngrediente = g => `${g.nombre} ${g.unidad === 'und' ? '×' + g.cantidad : g.cantidad + ' ' + g.unidad}`;

/**
 * @typedef {{ id?:number, nombre:string, precio:string, multiplicador:string }} VarForm
 * @typedef {{ insumo:string, cantidad:string, unidad:string }} IngForm
 * @typedef {{ nombre:string, emoji:string, categoria:string, imagenUrl:string, variantes:VarForm[],
 *   ingredientes:IngForm[], bebidaInsumo:string, extras:number[], salsas:string[] }} PlatoForm
 */

/** @param {any|null} p plato de /api/admin/platos @returns {PlatoForm} */
export function platoAForm(p) {
  if (!p) return { nombre: '', emoji: '🍽️', categoria: '', imagenUrl: '', variantes: [{ nombre: '', precio: '', multiplicador: '1' }],
    ingredientes: [{ insumo: '', cantidad: '', unidad: 'g' }], bebidaInsumo: '', extras: [], salsas: [] };
  const b = isBebida(p.categoria), ing = p.ingredientes || [];
  return {
    nombre: p.nombre, emoji: p.emoji || '🍽️', categoria: p.categoria, imagenUrl: p.imagenUrl || '',
    variantes: (p.variantes || []).map(v => ({ id: v.id, nombre: v.nombre, precio: String(v.precio), multiplicador: String(v.multiplicador ?? 1) })),
    ingredientes: b ? [] : ing.map(g => ({ insumo: g.nombre, cantidad: String(g.cantidad), unidad: g.unidad })),
    bebidaInsumo: b ? (ing[0]?.nombre || '') : '',
    extras: idsExtras(p), salsas: [...(p.salsas || [])],
  };
}

const conId = (id, o) => (id != null ? { id, ...o } : o);

/**
 * Valida el formulario del plato y arma el cuerpo para POST/PUT /api/admin/platos.
 * @param {PlatoForm} f @param {any[]} insumos
 * @returns {{error:string} | {body:any}}
 */
export function validarPlato(f, insumos) {
  const nombre = f.nombre.trim(), beb = isBebida(f.categoria), categoria = beb ? 'Bebidas' : f.categoria.trim();
  const variantes = f.variantes.map(v => conId(v.id, { nombre: String(v.nombre).trim(), precio: +v.precio, multiplicador: +v.multiplicador || 1 }))
    .filter(v => v.nombre && v.precio > 0);
  /** @type {IngForm[]} */
  const ing = beb
    ? (f.bebidaInsumo ? [{ insumo: f.bebidaInsumo, cantidad: '1', unidad: 'und' }] : [])
    : f.ingredientes.filter(g => g.insumo.trim() && +g.cantidad > 0);
  if (!nombre || !categoria || !variantes.length || (!beb && !ing.length))
    return { error: beb ? 'Completa nombre, categoría y al menos un tamaño con precio' : 'Completa nombre, categoría, al menos un tamaño con precio y un ingrediente' };
  const ingredientes = [];
  for (const g of ing) {
    const x = porNombre(insumos, g.insumo);
    if (!x) return { error: `El insumo "${g.insumo.trim()}" no existe: ingrésalo primero en Inventario` };
    if (!unidadesCompatibles(g.unidad, x.unidad)) return { error: `"${x.nombre}" se mide en ${x.unidad}: usa el mismo tipo de unidad` };
    ingredientes.push({ insumoId: x.id, cantidad: +g.cantidad, unidad: g.unidad });
  }
  return { body: { nombre, emoji: f.emoji || '🍽️', categoria, imagenUrl: f.imagenUrl || '', variantes, ingredientes,
    salsas: beb ? [] : f.salsas, extras: f.extras } };
}

/** Cuerpo PUT de un plato existente cambiando solo los extras ofrecidos. */
export function platoABody(p, extras) {
  return {
    nombre: p.nombre, emoji: p.emoji, categoria: p.categoria, imagenUrl: p.imagenUrl || '',
    variantes: p.variantes.map(v => conId(v.id, { nombre: v.nombre, precio: v.precio, multiplicador: v.multiplicador ?? 1 })),
    ingredientes: (p.ingredientes || []).map(g => ({ insumoId: g.insumoId, cantidad: g.cantidad, unidad: g.unidad })),
    salsas: p.salsas || [], extras,
  };
}

/**
 * Valida un extra (addX / xe originales) y arma el cuerpo de /api/admin/extras.
 * @param {{nombre:string, insumo:string, cantidad:string|number, unidad:string, precio:string|number, grupo:string}} f
 * @param {any[]} insumos
 */
export function validarExtra(f, insumos) {
  const nombre = String(f.nombre).trim(), cantidad = +f.cantidad, precio = +f.precio;
  if (!nombre || !(cantidad > 0) || !(precio >= 0) || f.precio === '') return { error: 'Completa nombre, cantidad y precio' };
  const x = porNombre(insumos, f.insumo);
  if (!x) return { error: 'Ese insumo no existe: ingrésalo primero en Inventario' };
  if (!unidadesCompatibles(f.unidad, x.unidad)) return { error: `Usa el mismo tipo de unidad que el inventario (${x.unidad})` };
  return { body: { nombre, insumoId: x.id, cantidad, unidad: f.unidad, precio, grupo: String(f.grupo || '').trim() || null } };
}
