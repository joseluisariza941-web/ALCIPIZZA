import { describe, expect, it } from 'vitest';
import { aForm, errorPromo, promoBody, promoVacia, resumenPromo } from './promociones.js';

const ok = { ...promoVacia(), nombre: 'Martes', valor: '10', inicio: '2026-11-01', fin: '2026-11-30' };

describe('promociones', () => {
  it('valida el formulario', () => {
    expect(errorPromo(ok)).toBe('');
    expect(errorPromo({ ...ok, nombre: ' ' })).toMatch('nombre');
    expect(errorPromo({ ...ok, valor: '150' })).toMatch('100');
    expect(errorPromo({ ...ok, alcance: 'plato' })).toMatch('plato');
    expect(errorPromo({ ...ok, alcance: 'categoria' })).toMatch('categoría');
    expect(errorPromo({ ...ok, inicio: '2026-12-01' })).toMatch('posterior');
    expect(errorPromo({ ...ok, horaDesde: '18:00' })).toMatch('hora');
  });

  it('arma el cuerpo según el alcance', () => {
    expect(promoBody({ ...ok, alcance: 'total', montoMinimo: '30000' })).toMatchObject({ valor: 10, montoMinimo: 30000, dias: null, horaDesde: null });
    expect(promoBody({ ...ok, alcance: 'plato', platoId: '4' }).platoId).toBe(4);
    expect(promoBody({ ...ok, alcance: 'categoria', categoria: 'Pizzas', dias: [4, 1], horaDesde: '17:00', horaHasta: '21:00' }))
      .toMatchObject({ categoria: 'Pizzas', dias: [1, 4], horaDesde: '17:00', horaHasta: '21:00' });
    expect(promoBody({ ...ok, dias: [0, 1, 2, 3, 4, 5, 6] }).dias).toBeNull();
  });

  it('convierte de la API al formulario y resume', () => {
    const f = aForm({ nombre: 'X', tipo: 'monto', alcance: 'total', valor: 2000, montoMinimo: null, dias: null, horaDesde: null });
    expect(f).toMatchObject({ montoMinimo: '', dias: [], horaDesde: '' });
    expect(resumenPromo({ tipo: 'porcentaje', valor: 15, alcance: 'categoria', categoria: 'Pizzas' })).toBe('15% en Pizzas');
    expect(resumenPromo({ tipo: 'monto', valor: 2000, alcance: 'total', montoMinimo: 30000 })).toContain('sobre el total desde');
  });
});
