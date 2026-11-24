import { describe, expect, it } from 'vitest';
import { alternarExtra, crearItem, cuerpoPedido, totalCarrito, validarPedido } from './carrito.js';

const hamburguesa = {
  id: 2, nombre: 'Hamburguesa', emoji: '🍔', categoria: 'Hamburguesas',
  variantes: [{ id: 21, nombre: 'Sencilla', precio: 14000 }, { id: 22, nombre: 'Doble carne', precio: 20000 }],
  ingredientes: ['Pan', 'Carne', 'Tomate'], salsas: ['Ketchup', 'Mayonesa'],
  extras: [
    { id: 1, nombre: 'Papas pequeña', precio: 3000, grupo: 'papas' },
    { id: 2, nombre: 'Papas mediana', precio: 5000, grupo: 'papas' },
    { id: 4, nombre: 'Queso extra', precio: 2000, grupo: null },
  ],
};

describe('crearItem', () => {
  it('toma la variante y los extras, y calcula el precio para mostrar', () => {
    const it1 = crearItem(hamburguesa, { varianteId: 22, extras: [2, 4], sin: ['Tomate'], salsas: ['Ketchup'], nota: 'bien asada' });
    expect(it1).toEqual({
      platoId: 2, varianteId: 22, extras: [2, 4], salsas: ['Ketchup'], sin: ['Tomate'], nota: 'bien asada',
      emoji: '🍔', nombre: 'Hamburguesa', variante: 'Doble carne', extrasNombres: ['Papas mediana', 'Queso extra'], precio: 27000,
    });
  });

  it('"Pedir con todo" no quita nada y lleva todas las salsas del plato', () => {
    const it1 = crearItem(hamburguesa, { varianteId: 21, extras: [], sin: ['Pan'], salsas: [], nota: '', conTodo: true });
    expect(it1.sin).toEqual([]);
    expect(it1.salsas).toEqual(['Ketchup', 'Mayonesa']);
  });

  it('usa la primera variante si no se indica', () => {
    expect(crearItem(hamburguesa, {}).variante).toBe('Sencilla');
  });
});

describe('alternarExtra', () => {
  it('los extras del mismo grupo son excluyentes', () => {
    let s = alternarExtra([], 1, hamburguesa.extras);
    s = alternarExtra(s, 4, hamburguesa.extras);
    s = alternarExtra(s, 2, hamburguesa.extras);
    expect([...s].sort()).toEqual([2, 4]);
  });
  it('tocar uno encendido lo apaga', () => {
    expect(alternarExtra([4, 1], 4, hamburguesa.extras)).toEqual([1]);
  });
});

it('totalCarrito suma los precios mostrados', () => {
  expect(totalCarrito([{ precio: 14000 }, { precio: 9000 }])).toBe(23000);
  expect(totalCarrito([])).toBe(0);
});

describe('validarPedido (mismos mensajes que send())', () => {
  const item = [{ precio: 1 }];
  const base = { destino: 'Domicilio', mesa: '', cliente: 'Juan', direccion: 'Cra 1', telefono: '300', metodoPago: 'ef' };
  it.each([
    [[], base, 'Primero agrega un plato a tu pedido'],
    [item, { ...base, destino: 'En el local' }, 'Elige tu mesa'],
    [item, { ...base, cliente: '  ' }, 'Escribe el nombre'],
    [item, { ...base, direccion: '' }, 'Escribe la dirección'],
    [item, { ...base, telefono: ' ' }, 'Escribe el teléfono'],
    [item, { ...base, destino: 'Recoger en local', telefono: '' }, 'Escribe el teléfono'],
  ])('caso %#', (items, form, msg) => expect(validarPedido(items, form)).toBe(msg));

  it('pedido completo es válido', () => {
    expect(validarPedido(item, base)).toBeNull();
    expect(validarPedido(item, { ...base, destino: 'En el local', mesa: '3', direccion: '', telefono: '' })).toBeNull();
  });
});

describe('cuerpoPedido (formato de docs/API.md, sin precios)', () => {
  const items = [crearItem(hamburguesa, { varianteId: 22, extras: [4], sin: ['Tomate'], salsas: ['Ketchup'], nota: 'x' })];

  it('domicilio lleva dirección y teléfono, no mesa', () => {
    const b = cuerpoPedido(items, { destino: 'Domicilio', mesa: '2', cliente: ' Juan ', direccion: ' Cra 1 ', telefono: ' 300 ', metodoPago: 'nq' });
    expect(b).toEqual({
      destino: 'Domicilio', cliente: 'Juan', direccion: 'Cra 1', telefono: '300', metodoPago: 'nq',
      items: [{ platoId: 2, varianteId: 22, extras: [4], salsas: ['Ketchup'], sin: ['Tomate'], nota: 'x' }],
    });
    expect(JSON.stringify(b)).not.toMatch(/precio/i);
  });

  it('en el local lleva la mesa como número', () => {
    const b = cuerpoPedido(items, { destino: 'En el local', mesa: '3', cliente: 'Ana', direccion: 'no', telefono: 'no', metodoPago: 'ef' });
    expect(b).toMatchObject({ destino: 'En el local', mesa: 3, cliente: 'Ana' });
    expect(b).not.toHaveProperty('direccion');
    expect(b).not.toHaveProperty('telefono');
  });

  it('recoger en local lleva teléfono pero no dirección', () => {
    const b = cuerpoPedido(items, { destino: 'Recoger en local', mesa: '', cliente: 'Ana', direccion: 'x', telefono: '311', metodoPago: 'ef' });
    expect(b.telefono).toBe('311');
    expect(b).not.toHaveProperty('direccion');
    expect(b).not.toHaveProperty('mesa');
  });
});
