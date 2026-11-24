import { describe, expect, it } from 'vitest';
import {
  money, cv, nivel, stockBajo, fmtStock, siguienteEstado, botonEstado, pedidosNuevos,
  waLink, isBebida, DN, diaApi, rangoSemana,
} from './util.js';

describe('money (igual que $$ original)', () => {
  it('formatea pesos colombianos sin decimales', () => {
    expect(money(28000)).toBe('$28.000');
    expect(money(1500.6)).toBe('$1.501');
    expect(money(0)).toBe('$0');
  });
});

describe('cv: conversión de unidades', () => {
  it('convierte entre g, kg y lb', () => {
    expect(cv(1, 'kg', 'g')).toBe(1000);
    expect(cv(500, 'g', 'kg')).toBe(0.5);
    expect(cv(1, 'lb', 'g')).toBeCloseTo(453.592);
  });
  it('no convierte und ni unidades iguales', () => {
    expect(cv(3, 'und', 'g')).toBe(3);
    expect(cv(3, 'g', 'g')).toBe(3);
  });
});

describe('nivel y stock bajo frente a stockReferencia', () => {
  it('calcula el nivel como fracción de la referencia', () => {
    expect(nivel({ stock: 50, stockReferencia: 100 })).toBe(0.5);
  });
  it('sin referencia el nivel es 0', () => {
    expect(nivel({ stock: 5, stockReferencia: 0 })).toBe(0);
  });
  it('stock bajo cuando queda menos del 20 %', () => {
    expect(stockBajo({ stock: 19, stockReferencia: 100 })).toBe(true);
    expect(stockBajo({ stock: 20, stockReferencia: 100 })).toBe(false);
  });
  it('fmtStock redondea a 2 decimales', () => {
    expect(fmtStock(1.23456)).toBe(1.23);
  });
});

describe('estados del pedido', () => {
  it('avanza nuevo → preparando → listo → entregado', () => {
    expect(siguienteEstado('nuevo')).toBe('preparando');
    expect(siguienteEstado('preparando')).toBe('listo');
    expect(siguienteEstado('listo')).toBe('entregado');
    expect(siguienteEstado('entregado')).toBe(null);
    expect(siguienteEstado('cancelado')).toBe(null);
  });
  it('usa los textos del original', () => {
    expect(botonEstado('nuevo')).toBe('Preparar');
    expect(botonEstado('preparando')).toBe('Finalizar y avisar');
    expect(botonEstado('listo')).toBe('Entregado');
  });
});

describe('pedidosNuevos (para la campana)', () => {
  it('devuelve los pedidos en estado nuevo que no se conocían', () => {
    const antes = new Set([1, 2]);
    const lista = [{ id: 3, estado: 'nuevo' }, { id: 2, estado: 'nuevo' }, { id: 4, estado: 'preparando' }];
    expect(pedidosNuevos(antes, lista).map(p => p.id)).toEqual([3]);
  });
});

describe('waLink', () => {
  it('arma el mensaje del pedido para WhatsApp', () => {
    const p = {
      id: 7, creadoEn: '2026-11-23T20:00:00Z', destino: 'Mesa 3', cliente: 'Juan', telefono: '300', direccion: '',
      total: 12000, pagoEstado: 'pendiente', metodoPago: { codigo: 'nq', nombre: 'Nequi' }, mesera: { id: 1, nombre: 'Ana' }, origen: 'mesera',
      items: [{ nombre: 'Pizza', variante: 'Pequeña', precioUnitario: 12000, sin: ['Tomate'], salsas: ['Ají'], extras: [{ nombre: 'Queso extra' }], nota: 'bien' }],
    };
    const url = waLink(p, { n: 'Alcipizza', tel: '3108819617' });
    expect(url.startsWith('https://wa.me/573108819617?text=')).toBe(true);
    const t = decodeURIComponent(url.split('text=')[1]);
    expect(t).toContain('*Alcipizza* · Pedido #7');
    expect(t).toContain('Mesa 3 · Juan · Tel 300');
    expect(t).toContain('• Pizza (Pequeña) $12.000 · sin Tomate · salsas: Ají · + Queso extra · "bien"');
    expect(t).toContain('*TOTAL $12.000*');
    expect(t).toContain('Pago pendiente (Nequi)');
    expect(t).toContain('Mesera: Ana');
  });
});

describe('varios', () => {
  it('isBebida reconoce la categoría Bebidas', () => {
    expect(isBebida(' bebidas ')).toBe(true);
    expect(isBebida('Bebida')).toBe(true);
    expect(isBebida('Pizzas')).toBe(false);
  });
  it('diaApi: índice 0 de la API es lunes', () => {
    expect(diaApi(0)).toBe('Lunes');
    expect(diaApi(6)).toBe('Domingo');
    expect(DN[0]).toBe('Domingo');
  });
  it('rangoSemana: últimos 7 días en formato AAAA-MM-DD', () => {
    expect(rangoSemana(new Date(2026, 10, 23, 15))).toEqual({ desde: '2026-11-17', hasta: '2026-11-23' });
  });
});
