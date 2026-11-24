// Lógica pura del carrito y del cuerpo de POST /api/pedidos (sin precios: el servidor los recalcula).

/**
 * @typedef {{ id:number, nombre:string, precio:number }} Variante
 * @typedef {{ id:number, nombre:string, precio:number, grupo:string|null }} Extra
 * @typedef {{ id:number, nombre:string, emoji:string, imagenUrl?:string, categoria:string, variantes:Variante[],
 *   ingredientes:string[], salsas:string[], extras:Extra[] }} Plato
 * @typedef {{ platoId:number, varianteId:number, extras:number[], salsas:string[], sin:string[], nota:string,
 *   emoji:string, nombre:string, variante:string, extrasNombres:string[], precio:number }} ItemCarrito
 * @typedef {{ destino:string, mesa:string, cliente:string, direccion:string, telefono:string, metodoPago:string }} FormPedido
 */

export const DESTINOS = ['Domicilio', 'Recoger en local', 'En el local'];

/** ¿Es la categoría de bebidas? (isB original) @param {string} c */
export const esBebida = c => /^bebidas?$/i.test(String(c || '').trim());

/**
 * Crea un ítem del carrito a partir de lo elegido en el modal (addM original).
 * @param {Plato} plato
 * @param {{ varianteId?:number, extras?:number[], sin?:string[], salsas?:string[], nota?:string, conTodo?:boolean }} sel
 * @returns {ItemCarrito}
 */
export function crearItem(plato, { varianteId, extras = [], sin = [], salsas = [], nota = '', conTodo = false }) {
  const v = plato.variantes.find(x => x.id === varianteId) || plato.variantes[0];
  const xs = extras.map(id => (plato.extras || []).find(e => e.id === id)).filter(Boolean);
  return {
    platoId: plato.id, varianteId: v.id, extras: xs.map(e => e.id),
    salsas: conTodo ? [...(plato.salsas || [])] : salsas, sin: conTodo ? [] : sin, nota,
    emoji: plato.emoji, nombre: plato.nombre, variante: v.nombre, extrasNombres: xs.map(e => e.nombre),
    precio: v.precio + xs.reduce((a, e) => a + e.precio, 0),
  };
}

/**
 * Enciende o apaga un extra; los del mismo grupo se excluyen (xtog original).
 * @param {number[]} sel @param {number} id @param {Extra[]} extras @returns {number[]}
 */
export function alternarExtra(sel, id, extras) {
  if (sel.includes(id)) return sel.filter(x => x !== id);
  const g = extras.find(e => e.id === id)?.grupo;
  const mismoGrupo = g ? extras.filter(e => e.grupo === g).map(e => e.id) : [];
  return [...sel.filter(x => !mismoGrupo.includes(x)), id];
}

/** @param {{precio:number}[]} items */
export const totalCarrito = items => items.reduce((a, c) => a + c.precio, 0);

const lleva = {
  direccion: d => d === 'Domicilio',
  telefono: d => d === 'Domicilio' || d === 'Recoger en local',
  mesa: d => d === 'En el local',
};
export const pideDireccion = lleva.direccion;
export const pideTelefono = lleva.telefono;
export const pideMesa = lleva.mesa;

/**
 * Valida antes de confirmar (send original). Devuelve el mensaje de error o null.
 * @param {unknown[]} items @param {FormPedido} f @returns {string|null}
 */
export function validarPedido(items, f) {
  if (!items.length) return 'Primero agrega un plato a tu pedido';
  if (pideMesa(f.destino) && !f.mesa) return 'Elige tu mesa';
  if (!f.cliente.trim()) return 'Escribe el nombre';
  if (pideDireccion(f.destino) && !f.direccion.trim()) return 'Escribe la dirección';
  if (pideTelefono(f.destino) && !f.telefono.trim()) return 'Escribe el teléfono';
  return null;
}

/**
 * Cuerpo de POST /api/pedidos para el cliente web (docs/API.md).
 * @param {ItemCarrito[]} items @param {FormPedido} f
 */
export function cuerpoPedido(items, f) {
  /** @type {Record<string, any>} */
  const b = { destino: f.destino };
  if (pideMesa(f.destino)) b.mesa = Number(f.mesa);
  b.cliente = f.cliente.trim();
  if (pideDireccion(f.destino)) b.direccion = f.direccion.trim();
  if (pideTelefono(f.destino)) b.telefono = f.telefono.trim();
  b.metodoPago = f.metodoPago;
  b.items = items.map(c => ({ platoId: c.platoId, varianteId: c.varianteId, extras: c.extras, salsas: c.salsas, sin: c.sin, nota: c.nota }));
  return b;
}
