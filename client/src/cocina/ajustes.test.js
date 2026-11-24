import { describe, expect, it } from 'vitest';
import { fijarHora, mesasValidas, metodoBody } from './ajustes.js';

describe('fijarHora (hh original)', () => {
  const h = [[18, 22], null, [18, 22], [18, 22], [18, 22], [18, 22], [18, 22]];
  it('cambia la hora de abrir sin mutar el original', () => {
    const r = fijarHora(h, 0, 0, '17.5');
    expect(r[0]).toEqual([17.5, 22]);
    expect(h[0]).toEqual([18, 22]);
  });
  it('un día cerrado toma 18-22 por defecto al escribir una hora', () => {
    expect(fijarHora(h, 1, 1, '23')[1]).toEqual([18, 23]);
  });
  it('vacío deja el día cerrado', () => {
    expect(fijarHora(h, 2, 1, '')[2]).toBeNull();
  });
});

describe('mesasValidas', () => {
  it('mínimo una mesa', () => {
    expect(mesasValidas('0')).toBe(1);
    expect(mesasValidas('')).toBe(1);
    expect(mesasValidas('12')).toBe(12);
  });
});

describe('metodoBody', () => {
  it('arma el cuerpo del PUT con los cambios', () => {
    expect(metodoBody({ codigo: 'nq', nombre: 'Nequi', numero: '300', activo: true }, { activo: false }))
      .toEqual({ nombre: 'Nequi', numero: '300', activo: false });
  });
});
