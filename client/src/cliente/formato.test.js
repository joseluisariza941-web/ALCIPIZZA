import { describe, expect, it } from 'vitest';
import { fechaCorta, h12, pesos, precioItem } from './formato.js';

describe('formato', () => {
  it('pesos: igual que $$ original (es-CO, sin decimales)', () => {
    expect(pesos(28000)).toBe('$28.000');
    expect(pesos(1234.6)).toBe('$1.235');
    expect(pesos(0)).toBe('$0');
  });

  it('h12: horas decimales a 12 h como el cartel original', () => {
    expect(h12(18)).toBe('6:00 pm');
    expect(h12(9.5)).toBe('9:30 am');
    expect(h12(0)).toBe('12:00 am');
    expect(h12(12)).toBe('12:00 pm');
  });

  it('fechaCorta usa el mismo formato que fd() original', () => {
    const iso = '2026-03-05T19:07:00';
    expect(fechaCorta(iso)).toBe(new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }));
  });

  it('precioItem usa precioUnitario, que ya trae los extras', () => {
    // precioUnitario ya incluye variante + extras (lo calcula el servidor): no se vuelven a sumar
    expect(precioItem({ precioUnitario: 14000, extras: [{ precio: 3000 }, { precio: 2000 }] })).toBe(14000);
    expect(precioItem({ precioUnitario: 9000 })).toBe(9000);
  });
});
