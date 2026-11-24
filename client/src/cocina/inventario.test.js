import { describe, expect, it } from 'vitest';
import { validarCompra, ultimaCompra, filtrarCompras, nombreSurtidor, totalInvertido } from './inventario.js';
import { compras, insumos, surtidores } from './fixtures.js';

describe('validarCompra (compra() original)', () => {
  const f = { nombre: 'Queso', tipo: 'insumo', cantidad: '2', unidad: 'kg', costo: '30000', surtidor: '1' };
  it('exige producto y cantidad', () => {
    expect(validarCompra({ ...f, nombre: ' ' }, insumos)).toEqual({ error: 'Escribe el producto' });
    expect(validarCompra({ ...f, cantidad: '0' }, insumos)).toEqual({ error: 'Escribe la cantidad' });
  });
  it('compra de un insumo existente', () => {
    expect(validarCompra(f, insumos)).toEqual({ body: { insumoId: 1, cantidad: 2, unidad: 'kg', costo: 30000, surtidorId: 1 }, nuevo: false });
  });
  it('reconoce el insumo sin importar mayúsculas', () => {
    expect(validarCompra({ ...f, nombre: 'queso' }, insumos).body.insumoId).toBe(1);
  });
  it('rechaza unidades incompatibles', () => {
    expect(validarCompra({ ...f, unidad: 'und' }, insumos)).toEqual({ error: 'Unidad incompatible: este producto se mide en g' });
  });
  it('crea el insumo si no existe; compra en tienda = surtidor nulo; costo vacío = 0', () => {
    expect(validarCompra({ ...f, nombre: 'Tomate', unidad: 'g', costo: '', surtidor: 'tienda' }, insumos)).toEqual({
      body: { nuevoInsumo: { nombre: 'Tomate', tipo: 'insumo', unidad: 'g' }, cantidad: 2, unidad: 'g', costo: 0, surtidorId: null }, nuevo: true,
    });
  });
});

describe('ayudas del inventario', () => {
  it('ultimaCompra devuelve la compra más reciente del insumo', () => {
    const l = [...compras, { ...compras[0], id: 2, fecha: '2026-11-23T10:00:00Z' }];
    expect(ultimaCompra(l, 1).id).toBe(2);
    expect(ultimaCompra(l, 99)).toBe(undefined);
  });
  it('nombreSurtidor (sn original)', () => {
    expect(nombreSurtidor(null, surtidores)).toBe('Compra en tienda');
    expect(nombreSurtidor(1, surtidores)).toBe('Pedro');
    expect(nombreSurtidor(9, surtidores)).toBe('Surtidor eliminado');
  });
  it('filtrarCompras busca por insumo, surtidor o quien registró, más recientes primero', () => {
    const l = [...compras, { ...compras[0], id: 2, fecha: '2026-11-23T10:00:00Z', insumo: { id: 2, nombre: 'Carne' }, surtidor: null }];
    expect(filtrarCompras(l, 'carne').map(c => c.id)).toEqual([2]);
    expect(filtrarCompras(l, 'pedro').map(c => c.id)).toEqual([1]);
    expect(filtrarCompras(l, 'tienda').map(c => c.id)).toEqual([2]);
    expect(filtrarCompras(l, '').map(c => c.id)).toEqual([2, 1]);
  });
  it('totalInvertido suma el costo de las compras', () => {
    expect(totalInvertido([{ costo: 1000 }, { costo: 2500 }])).toBe(3500);
  });
});
