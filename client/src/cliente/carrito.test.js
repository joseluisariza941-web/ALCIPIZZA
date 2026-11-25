import { describe, expect, it } from 'vitest';
import {
  alternarExtra, celularValido, crearItem, cuerpoCotizar, cuerpoPedido, formDePedido, itemsDePedido,
  normalizarCelular, totalCarrito, validarPedido,
} from './carrito.js';

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

  it('envía el celular normalizado cuando se escribe', () => {
    const b = cuerpoPedido(items, { destino: 'Domicilio', mesa: '', cliente: 'Ana', direccion: 'x', telefono: '311', metodoPago: 'ef', celular: '+57 300 123-4567' });
    expect(b.celular).toBe('3001234567');
    expect(b).not.toHaveProperty('canjearPuntos');
  });

  it('no envía celular si está vacío', () => {
    const b = cuerpoPedido(items, { destino: 'Domicilio', mesa: '', cliente: 'Ana', direccion: 'x', telefono: '311', metodoPago: 'ef', celular: '' });
    expect(b).not.toHaveProperty('celular');
  });
});

describe('celular para puntos', () => {
  it('acepta 10 dígitos que empiezan por 3, con o sin +57/espacios/guiones', () => {
    expect(celularValido('3001234567')).toBe(true);
    expect(celularValido('+57 300 123-4567')).toBe(true);
    expect(normalizarCelular('+57 300 123-4567')).toBe('3001234567');
  });

  it('rechaza números incompletos o que no empiezan por 3', () => {
    expect(celularValido('300123456')).toBe(false);
    expect(celularValido('2001234567')).toBe(false);
    expect(celularValido('')).toBe(false);
  });

  it('validarPedido solo lo exige si se escribió algo', () => {
    const item = [{ precio: 1 }];
    const base = { destino: 'Domicilio', mesa: '', cliente: 'Juan', direccion: 'Cra 1', telefono: '300', metodoPago: 'ef', celular: '' };
    expect(validarPedido(item, base)).toBeNull();
    expect(validarPedido(item, { ...base, celular: '123' })).toBe('Escribe un celular válido (10 dígitos que empiezan por 3)');
    expect(validarPedido(item, { ...base, celular: '3001234567' })).toBeNull();
  });
});

describe('cotizar (solo items y celular, el servidor calcula)', () => {
  const items = [crearItem(hamburguesa, { varianteId: 22, extras: [4], sin: ['Tomate'], salsas: ['Ketchup'], nota: 'x' })];

  it('manda items y normaliza el celular si viene', () => {
    expect(cuerpoCotizar(items, { celular: '+57 300 123 4567' })).toEqual({
      celular: '3001234567',
      items: [{ platoId: 2, varianteId: 22, extras: [4], salsas: ['Ketchup'], sin: ['Tomate'], nota: 'x' }],
    });
  });

  it('sin celular solo manda items y nunca montos ni canje', () => {
    const b = cuerpoCotizar(items, {});
    expect(b).toEqual({ items: [{ platoId: 2, varianteId: 22, extras: [4], salsas: ['Ketchup'], sin: ['Tomate'], nota: 'x' }] });
    expect(JSON.stringify(b)).not.toMatch(/precio|total|canjear/i);
  });
});

describe('editar un pedido existente', () => {
  const pedido = {
    id: 7, destino: 'En el local · Mesa 3', cliente: 'Ana', direccion: null, telefono: '3001234567',
    celular: '3001234567', metodoPago: { codigo: 'nq', nombre: 'Nequi' },
    items: [{ platoId: 2, varianteId: 22, nombre: 'Hamburguesa', emoji: '🍔', variante: 'Doble carne', precioUnitario: 22000,
      extras: [{ id: 4, nombre: 'Queso extra' }], salsas: ['Ketchup'], sin: ['Tomate'], nota: 'x' }],
  };

  it('itemsDePedido vuelve a armar el carrito', () => {
    expect(itemsDePedido(pedido)).toEqual([{
      platoId: 2, varianteId: 22, extras: [4], salsas: ['Ketchup'], sin: ['Tomate'], nota: 'x',
      emoji: '🍔', nombre: 'Hamburguesa', variante: 'Doble carne', extrasNombres: ['Queso extra'], precio: 22000,
    }]);
  });

  it('formDePedido separa el destino de la mesa y conserva el celular', () => {
    expect(formDePedido(pedido)).toEqual({
      destino: 'En el local', mesa: '3', cliente: 'Ana', direccion: '', telefono: '3001234567', metodoPago: 'nq', celular: '3001234567',
    });
  });
});
