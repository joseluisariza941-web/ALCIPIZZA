// Lógica pura de Inventario y compras.
import { fd } from './util.js';
import { unidadesCompatibles } from './unidades.js';

const buscar = (lista, nombre) => lista.find(x => x.nombre.trim().toLowerCase() === nombre.trim().toLowerCase());

/**
 * Valida el formulario "Ingresar producto" y arma el cuerpo de POST /api/compras.
 * @param {{nombre:string, tipo:string, cantidad:string, unidad:string, costo:string, surtidor:string}} f
 * @param {any[]} insumos
 * @returns {{error:string} | {body:any, nuevo:boolean}}
 */
export function validarCompra(f, insumos) {
  const nombre = f.nombre.trim(), cantidad = +f.cantidad, costo = +f.costo || 0;
  if (!nombre) return { error: 'Escribe el producto' };
  if (!(cantidad > 0)) return { error: 'Escribe la cantidad' };
  const surtidorId = !f.surtidor || f.surtidor === 'tienda' ? null : +f.surtidor;
  const x = buscar(insumos, nombre);
  if (x && !unidadesCompatibles(f.unidad, x.unidad)) return { error: 'Unidad incompatible: este producto se mide en ' + x.unidad };
  const base = { cantidad, unidad: f.unidad, costo, surtidorId };
  return x
    ? { body: { insumoId: x.id, ...base }, nuevo: false }
    : { body: { nuevoInsumo: { nombre, tipo: f.tipo, unidad: f.unidad }, ...base }, nuevo: true };
}

const t = c => new Date(c.fecha).getTime();
/** Compra más reciente de un insumo. */
export const ultimaCompra = (compras, insumoId) =>
  compras.filter(c => c.insumo?.id === insumoId).sort((a, b) => t(b) - t(a))[0];

/** Nombre del surtidor de un insumo (sn original). */
export const nombreSurtidor = (id, surtidores) =>
  id == null ? 'Compra en tienda' : (surtidores.find(z => z.id === id)?.nombre || 'Surtidor eliminado');

const surtidorCompra = c => (c.surtidor ? c.surtidor.nombre : 'Compra en tienda');
/** Historial filtrado por texto, más recientes primero (hc original). */
export const filtrarCompras = (compras, q) => compras.slice().sort((a, b) => t(b) - t(a))
  .filter(c => `${c.insumo?.nombre} ${fd(c.fecha)} ${c.registradoPor?.nombre || ''} ${surtidorCompra(c)}`.toLowerCase().includes(q.toLowerCase()));

export { surtidorCompra };
export const totalInvertido = compras => compras.reduce((a, c) => a + (Number(c.costo) || 0), 0);
