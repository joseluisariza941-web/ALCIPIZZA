import { describe, expect, it } from 'vitest';
import { validarPlato, platoAForm, platoABody, idsExtras, validarExtra, pillIngrediente } from './platos.js';
import { insumos, platos } from './fixtures.js';

const form = (o = {}) => ({
  nombre: 'Hamburguesa', emoji: '🍔', categoria: 'Hamburguesas', imagenUrl: '',
  variantes: [{ nombre: 'Sencilla', precio: '12000', multiplicador: '1' }, { nombre: '', precio: '', multiplicador: '1' }],
  ingredientes: [{ insumo: 'Carne', cantidad: '0.15', unidad: 'kg' }, { insumo: '', cantidad: '', unidad: 'g' }],
  bebidaInsumo: '', extras: [4], salsas: ['Ketchup'], ...o,
});

describe('validarPlato (saveP original)', () => {
  it('arma el cuerpo con variantes, ingredientes por insumoId, salsas y extras', () => {
    expect(validarPlato(form(), insumos)).toEqual({ body: {
      nombre: 'Hamburguesa', emoji: '🍔', categoria: 'Hamburguesas', imagenUrl: '',
      variantes: [{ nombre: 'Sencilla', precio: 12000, multiplicador: 1 }],
      ingredientes: [{ insumoId: 2, cantidad: 0.15, unidad: 'kg' }],
      salsas: [3], extras: [4],
    } });
  });
  it('consumo vacío o 0 equivale a 1 y el emoji por defecto es 🍽️', () => {
    const r = validarPlato(form({ emoji: '', variantes: [{ nombre: 'Mitad', precio: '6000', multiplicador: '' }] }), insumos);
    expect(r.body.emoji).toBe('🍽️');
    expect(r.body.variantes[0].multiplicador).toBe(1);
  });
  it('conserva el id de las variantes existentes', () => {
    const r = validarPlato(form({ variantes: [{ id: 3, nombre: 'Sencilla', precio: '1', multiplicador: '0.5' }] }), insumos);
    expect(r.body.variantes).toEqual([{ id: 3, nombre: 'Sencilla', precio: 1, multiplicador: 0.5 }]);
  });
  it('exige nombre, categoría, un tamaño con precio y un ingrediente', () => {
    const msg = 'Completa nombre, categoría, al menos un tamaño con precio y un ingrediente';
    expect(validarPlato(form({ nombre: '' }), insumos)).toEqual({ error: msg });
    expect(validarPlato(form({ categoria: ' ' }), insumos)).toEqual({ error: msg });
    expect(validarPlato(form({ variantes: [] }), insumos)).toEqual({ error: msg });
    expect(validarPlato(form({ ingredientes: [] }), insumos)).toEqual({ error: msg });
  });
  it('el insumo debe existir y usar el mismo tipo de unidad', () => {
    expect(validarPlato(form({ ingredientes: [{ insumo: 'Pan', cantidad: '1', unidad: 'und' }] }), insumos))
      .toEqual({ error: 'El insumo "Pan" no existe: ingrésalo primero en Inventario' });
    expect(validarPlato(form({ ingredientes: [{ insumo: 'Carne', cantidad: '1', unidad: 'und' }] }), insumos))
      .toEqual({ error: '"Carne" se mide en kg: usa el mismo tipo de unidad' });
  });
  it('la salsa debe existir en Inventario', () => {
    expect(validarPlato(form({ salsas: ['Mostaza'] }), insumos)).toEqual({ error: 'La salsa "Mostaza" no existe en Inventario' });
  });
  it('las bebidas usan 1 unidad del producto, sin salsas ni ingredientes obligatorios', () => {
    const r = validarPlato(form({ categoria: 'bebidas', bebidaInsumo: 'Gaseosa' }), insumos);
    expect(r.body.categoria).toBe('Bebidas');
    expect(r.body.ingredientes).toEqual([{ insumoId: 4, cantidad: 1, unidad: 'und' }]);
    expect(r.body.salsas).toEqual([]);
    expect(validarPlato(form({ categoria: 'Bebidas', nombre: '' }), insumos))
      .toEqual({ error: 'Completa nombre, categoría y al menos un tamaño con precio' });
    expect(validarPlato(form({ categoria: 'Bebidas', bebidaInsumo: '' }), insumos).body.ingredientes).toEqual([]);
  });
});

describe('conversión de platos', () => {
  it('platoAForm prepara el formulario de edición', () => {
    expect(platoAForm(platos[0])).toEqual({
      nombre: 'Pizza', emoji: '🍕', categoria: 'Pizzas', imagenUrl: '',
      variantes: [{ id: 1, nombre: 'Pequeña', precio: '16000', multiplicador: '1' }],
      ingredientes: [{ insumo: 'Queso', cantidad: '100', unidad: 'g' }],
      bebidaInsumo: '', extras: [4], salsas: ['Ketchup'],
    });
    expect(platoAForm(platos[1]).bebidaInsumo).toBe('Gaseosa');
  });
  it('platoAForm sin plato da un formulario vacío', () => {
    const f = platoAForm(null);
    expect(f.emoji).toBe('🍽️');
    expect(f.variantes).toHaveLength(1);
    expect(f.ingredientes).toHaveLength(1);
  });
  it('platoABody cambia solo los extras ofrecidos', () => {
    expect(platoABody(platos[0], [])).toEqual({
      nombre: 'Pizza', emoji: '🍕', categoria: 'Pizzas', imagenUrl: '',
      variantes: [{ id: 1, nombre: 'Pequeña', precio: 16000, multiplicador: 1 }],
      ingredientes: [{ insumoId: 1, cantidad: 100, unidad: 'g' }], salsas: [3], extras: [],
    });
  });
  it('idsExtras acepta objetos o ids', () => {
    expect(idsExtras({ extras: [{ id: 4 }, 5] })).toEqual([4, 5]);
    expect(idsExtras({})).toEqual([]);
  });
  it('pillIngrediente muestra cantidad y unidad (× para und)', () => {
    expect(pillIngrediente({ nombre: 'Queso', cantidad: 100, unidad: 'g' })).toBe('Queso 100 g');
    expect(pillIngrediente({ nombre: 'Pan', cantidad: 2, unidad: 'und' })).toBe('Pan ×2');
  });
});

describe('validarExtra (addX / xe originales)', () => {
  const f = { nombre: 'Queso extra', insumo: 'Queso', cantidad: '30', unidad: 'g', precio: '2000', grupo: ' ' };
  it('arma el cuerpo con insumoId y grupo nulo si está vacío', () => {
    expect(validarExtra(f, insumos)).toEqual({ body: { nombre: 'Queso extra', insumoId: 1, cantidad: 30, unidad: 'g', precio: 2000, grupo: null } });
  });
  it('exige nombre, cantidad y precio', () => {
    expect(validarExtra({ ...f, precio: '' }, insumos)).toEqual({ error: 'Completa nombre, cantidad y precio' });
    expect(validarExtra({ ...f, cantidad: '0' }, insumos)).toEqual({ error: 'Completa nombre, cantidad y precio' });
  });
  it('el insumo debe existir con el mismo tipo de unidad', () => {
    expect(validarExtra({ ...f, insumo: 'Nada' }, insumos)).toEqual({ error: 'Ese insumo no existe: ingrésalo primero en Inventario' });
    expect(validarExtra({ ...f, unidad: 'und' }, insumos)).toEqual({ error: 'Usa el mismo tipo de unidad que el inventario (g)' });
  });
});
