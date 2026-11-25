import { describe, expect, it } from 'vitest';
import { UNIDADES, etiquetaUnidad, unidadesCompatibles } from './unidades.js';

describe('unidades', () => {
  it('ofrece und, g, kg, lb, Litros y ml con el código del servidor', () => {
    expect(UNIDADES.map(u => u.valor)).toEqual(['und', 'g', 'kg', 'lb', 'L', 'ml']);
    expect(etiquetaUnidad('L')).toBe('Litros');
    expect(etiquetaUnidad('kg')).toBe('kg');
  });
  it('compatibles solo dentro de su grupo', () => {
    expect(unidadesCompatibles('g', 'lb')).toBe(true);
    expect(unidadesCompatibles('L', 'ml')).toBe(true);
    expect(unidadesCompatibles('L', 'g')).toBe(false);
    expect(unidadesCompatibles('und', 'g')).toBe(false);
    expect(unidadesCompatibles('und', 'und')).toBe(true);
  });
});
