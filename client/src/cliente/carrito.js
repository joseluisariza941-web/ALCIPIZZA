// Lógica pura del carrito y del cuerpo de POST /api/pedidos (sin precios: el servidor los recalcula).

/**
 * @typedef {{ id:number, nombre:string, precio:number }} Variante
 * @typedef {{ id:number, nombre:string, precio:number, grupo:string|null }} Extra
 * @typedef {{ id:number, nombre:string, emoji:string, imagenUrl?:string, categoria:string, variantes:Variante[],
 *   ingredientes:string[], salsas:string[], extras:Extra[] }} Plato
 * @typedef {{ platoId:number, varianteId:number, extras:number[], salsas:string[], sin:string[], nota:string,
 *   emoji:string, nombre:string, variante:string, extrasNombres:string[], precio:number }} ItemCarrito
 * @typedef {{ destino:string, mesa:string, cliente:string, direccion:string, telefono:string, metodoPago:string, celular:string }} FormPedido
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

/** Celular colombiano de 10 dígitos que empieza por 3 (acepta +57, espacios y guiones). @param {string} celular */
export function normalizarCelular(celular) {
  let n = String(celular || '').replace(/\D/g, '');
  if (n.length === 12 && n.startsWith('57')) n = n.slice(2);
  return n;
}

/** @param {string} celular */
export const celularValido = celular => /^3\d{9}$/.test(normalizarCelular(celular));

/** Ítems de un Pedido de la API al carrito (para editar). @param {{items?: any[]}} pedido */
export function itemsDePedido(pedido) {
  return (pedido?.items || []).map(it => ({
    platoId: it.platoId, varianteId: it.varianteId, extras: (it.extras || []).map(e => e.id),
    salsas: it.salsas || [], sin: it.sin || [], nota: it.nota || '',
    emoji: it.emoji, nombre: it.nombre, variante: it.variante,
    extrasNombres: (it.extras || []).map(e => e.nombre), precio: it.precioUnitario || 0,
  }));
}

/** Formulario del cliente a partir de un Pedido existente (para editar). @param {any} pedido */
export function formDePedido(pedido) {
  const partes = String(pedido?.destino || '').split(' · ');
  const destino = DESTINOS.includes(partes[0]) ? partes[0] : DESTINOS[0];
  const mesa = (partes.find(x => /^Mesa\s+\d+$/i.test(x)) || '').replace(/\D/g, '');
  return {
    destino, mesa, cliente: pedido?.cliente || '', direccion: pedido?.direccion || '',
    telefono: pedido?.telefono || '', metodoPago: pedido?.metodoPago?.codigo || '', celular: pedido?.celular || '',
  };
}

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
  if (f.celular && f.celular.trim() && !celularValido(f.celular)) return 'Escribe un celular válido (10 dígitos que empiezan por 3)';
  return null;
}

/**
 * Ítems del cuerpo de un pedido (el servidor recalcula precios).
 * @param {ItemCarrito[]} items
 */
export const itemsPedido = items => items.map(c => ({ platoId: c.platoId, varianteId: c.varianteId, extras: c.extras, salsas: c.salsas, sin: c.sin, nota: c.nota }));

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
  if (f.celular && f.celular.trim()) b.celular = normalizarCelular(f.celular);
  b.metodoPago = f.metodoPago;
  b.items = itemsPedido(items);
  return b;
}

/**
 * Cuerpo de POST /api/pedidos/cotizar: solo items y celular; el servidor calcula montos.
 * @param {ItemCarrito[]} items @param {{celular?:string}} [f]
 */
export function cuerpoCotizar(items, f = {}) {
  /** @type {Record<string, any>} */
  const b = { items: itemsPedido(items) };
  if (f.celular && f.celular.trim()) b.celular = normalizarCelular(f.celular);
  return b;
}
