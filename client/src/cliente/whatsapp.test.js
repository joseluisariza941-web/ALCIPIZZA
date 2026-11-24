import { describe, expect, it } from 'vitest';
import { waLink } from './whatsapp.js';
import { fechaCorta } from './formato.js';

const pedido = {
  id: 7, creadoEn: '2026-11-23T19:30:00', origen: 'web', mesera: null, destino: 'Domicilio', cliente: 'Juan',
  direccion: 'Cra 1 #2-3', telefono: '3001234567', total: 27000, estado: 'nuevo', pagoEstado: 'pendiente',
  metodoPago: { codigo: 'nq', nombre: 'Nequi' },
  items: [{ id: 1, platoId: 2, nombre: 'Hamburguesa', emoji: '🍔', variante: 'Doble carne', precioUnitario: 27000, nota: 'bien asada',
    extras: [{ id: 4, nombre: 'Queso extra', precio: 2000 }, { id: 2, nombre: 'Papas mediana', precio: 5000 }], salsas: ['Ketchup'], sin: ['Tomate'] }],
};

describe('waLink (igual que el original)', () => {
  it('arma el enlace a wa.me con el teléfono del local y el texto del pedido', () => {
    const url = waLink(pedido, { n: 'Alcipizza', tel: '3108819617' });
    expect(url.startsWith('https://wa.me/573108819617?text=')).toBe(true);
    const texto = decodeURIComponent(url.split('?text=')[1]);
    expect(texto.split('\n')).toEqual([
      '*Alcipizza* · Pedido #7',
      fechaCorta(pedido.creadoEn),
      'Domicilio · Juan · Tel 3001234567 · Cra 1 #2-3',
      '',
      '• Hamburguesa (Doble carne) $27.000 · sin Tomate · salsas: Ketchup · + Queso extra, Papas mediana · "bien asada"',
      '',
      '*TOTAL $27.000*',
      'Pago pendiente (Nequi)',
      'Compra web',
    ]);
  });

  it('pedido pagado de mesera', () => {
    const p = { ...pedido, pagoEstado: 'pagado', mesera: { id: 3, nombre: 'Ana' }, cliente: '', telefono: '', direccion: '', destino: 'Mesa 3',
      items: [{ ...pedido.items[0], precioUnitario: 20000, extras: [], salsas: [], sin: [], nota: '' }] };
    const t = decodeURIComponent(waLink(p, { n: 'Alcipizza', tel: '1' }).split('?text=')[1]).split('\n');
    expect(t[2]).toBe('Mesa 3');
    expect(t[4]).toBe('• Hamburguesa (Doble carne) $20.000');
    expect(t.slice(-2)).toEqual(['Pagado con Nequi', 'Mesera: Ana']);
  });
});
