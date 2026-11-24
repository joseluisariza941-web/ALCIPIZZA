import { describe, expect, it } from 'vitest';
import { DIAS, estaAbierto, filasHorario, indiceDia } from './horario.js';

// h: lunes..domingo (contrato de la API)
const H = [[18, 22], [18, 22], null, [18, 22], [18, 22], [18, 22.5], [10, 14]];
const lunes = (hh, mm = 0) => new Date(2026, 10, 23, hh, mm); // 23-nov-2026 es lunes

describe('horario', () => {
  it('indiceDia convierte getDay (domingo=0) a lunes=0', () => {
    expect(indiceDia(lunes(10))).toBe(0);
    expect(indiceDia(new Date(2026, 10, 29))).toBe(6); // domingo
  });

  it('estaAbierto respeta apertura (incluida) y cierre (excluido)', () => {
    expect(estaAbierto(H, lunes(17, 59))).toBe(false);
    expect(estaAbierto(H, lunes(18))).toBe(true);
    expect(estaAbierto(H, lunes(21, 59))).toBe(true);
    expect(estaAbierto(H, lunes(22))).toBe(false);
  });

  it('día sin horario (null) o sin datos está cerrado', () => {
    expect(estaAbierto(H, new Date(2026, 10, 25, 19))).toBe(false); // miércoles
    expect(estaAbierto(undefined, lunes(19))).toBe(false);
  });

  it('filasHorario arma lunes..domingo marcando hoy y cerrados', () => {
    const f = filasHorario(H, lunes(10));
    expect(f.map(x => x.dia)).toEqual(DIAS);
    expect(f[0]).toEqual({ dia: 'Lunes', texto: '6:00 pm – 10:00 pm', hoy: true, cerrado: false });
    expect(f[2]).toEqual({ dia: 'Miércoles', texto: 'CERRADO', hoy: false, cerrado: true });
    expect(f[5].texto).toBe('6:00 pm – 10:30 pm');
  });
});
