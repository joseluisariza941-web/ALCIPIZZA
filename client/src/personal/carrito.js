// Lógica pura del pedido de la mesera: carrito, validación y cuerpo para la API.
import { celularValido, normalizarCelular } from '../cliente/carrito.js';

/**
 * @typedef {{ id:number, nombre:string, precio:number }} Variante
 * @typedef {{ id:number, nombre:string, precio:number, grupo:string|null }} Extra
 * @typedef {{ id:number, nombre:string, emoji:string, imagenUrl:string|null, categoria:string, variantes:Variante[],
 *   ingredientes:string[], salsas:string[], extras:Extra[] }} Plato
 * @typedef {{ platoId:number, varianteId:number|null, nombre:string, emoji:string, variante:string, precio:number,
 *   extras:{id:number,nombre:string,precio:number}[], sin:string[], salsas:string[], nota:string }} ItemCarrito
 * @typedef {{ destino:string, cliente?:string, direccion?:string, telefono?:string, celular?:string }} Datos
 */

/** Las bebidas no muestran ingredientes ni salsas. @param {Plato} p */
export const esBebida = p => p.categoria === 'Bebidas';

/**
 * Ítem del carrito a partir de lo elegido en el modal (como addM() original).
 * @param {Plato} plato
 * @param {{varianteId:number, extras:number[], sin:string[], salsas:string[], nota:string}} sel
 * @param {boolean} [todo] "Pedir con todo": no quita nada y lleva todas las salsas del plato
 * @returns {ItemCarrito}
 */
export function itemDesdeSeleccion(plato, sel, todo = false) {
  const v = plato.variantes.find(x => x.id === sel.varianteId) || plato.variantes[0];
  const extras = (plato.extras || []).filter(e => sel.extras.includes(e.id)).map(({ id, nombre, precio }) => ({ id, nombre, precio }));
  return {
    platoId: plato.id, varianteId: v.id, nombre: plato.nombre, emoji: plato.emoji, variante: v.nombre,
    precio: v.precio + extras.reduce((a, e) => a + e.precio, 0),
    extras,
    sin: todo ? [] : [...sel.sin],
    salsas: todo ? [...(plato.salsas || [])] : [...sel.salsas],
    nota: (sel.nota || '').trim(),
  };
}

/** @param {{precio:number}[]} cart */
export const totalCarrito = cart => cart.reduce((a, c) => a + c.precio, 0);

/** Mesas 1..n y domicilio. @param {number} mesas */
export const opcionesDestino = mesas => [...Array(Number(mesas) || 0)].map((_, i) => 'Mesa ' + (i + 1)).concat('Domicilio');

/**
 * Mismos mensajes que send() original para la mesera.
 * @param {any[]} cart @param {Datos} d @returns {string|null}
 */
export function validarPedido(cart, d) {
  if (!cart.length) return 'Primero agrega un plato a tu pedido';
  if (!d.destino) return 'Elige la mesa o domicilio';
  if (d.destino === 'Domicilio') {
    if (!(d.cliente || '').trim()) return 'Escribe el nombre';
    if (!(d.direccion || '').trim()) return 'Escribe la dirección';
  }
  if ((d.celular || '').trim() && !celularValido(d.celular)) return 'Escribe un celular válido (10 dígitos que empiezan por 3)';
  return null;
}

/**
 * Cuerpo de POST/PUT /api/pedidos. Sin precios: el servidor los recalcula.
 * @param {ItemCarrito[]} cart @param {Datos} d
 */
export function cuerpoPedido(cart, d) {
  /** @type {Record<string, any>} */
  const body = { destino: d.destino };
  const mesa = /^Mesa (\d+)$/.exec(d.destino);
  if (mesa) body.mesa = Number(mesa[1]);
  if (d.destino === 'Domicilio') {
    for (const k of ['cliente', 'direccion', 'telefono']) {
      const v = (d[k] || '').trim();
      if (v) body[k] = v;
    }
  }
  if ((d.celular || '').trim()) body.celular = normalizarCelular(d.celular);
  body.items = cart.map(c => ({ platoId: c.platoId, varianteId: c.varianteId, extras: c.extras.map(e => e.id), salsas: c.salsas, sin: c.sin, nota: c.nota }));
  return body;
}

/**
 * Carrito editable a partir de un pedido guardado (la variante viene por nombre).
 * @param {{items:any[]}} pedido @param {Plato[]} menu @returns {ItemCarrito[]}
 */
export function carritoDesdePedido(pedido, menu) {
  return pedido.items.map(it => {
    const plato = menu.find(p => p.id === it.platoId);
    const v = plato?.variantes.find(x => x.nombre === it.variante);
    const extras = (it.extras || []).map(({ id, nombre, precio }) => ({ id, nombre, precio }));
    return {
      platoId: it.platoId, varianteId: v?.id ?? null, nombre: it.nombre, emoji: it.emoji, variante: it.variante,
      precio: v ? v.precio + extras.reduce((a, e) => a + e.precio, 0) : it.precioUnitario,
      extras, sin: [...(it.sin || [])], salsas: [...(it.salsas || [])], nota: it.nota || '',
    };
  });
}
