import { describe, expect, it } from 'vitest';
import { diasDelRango, estrellas, filtrarVentas, kpis } from './reporte.js';
import { pedido, platos } from './fixtures.js';

const rep = { total: 50000, pedidos: 2, compras: 20000, porPlato: [{ nombre: 'Pizza', cantidad: 3, total: 48000 }, { nombre: 'Gaseosa', cantidad: 1, total: 3000 }],
  porMetodo: [{ metodo: 'Nequi', total: 50000 }], porDia: [{ fecha: '2026-11-22', total: 30000 }, { fecha: '2026-11-23', total: 20000 }] };
const peds = [pedido({ id: 1, total: 30000, pagoEstado: 'pagado' }), pedido({ id: 2, total: 20000, origen: 'mesera', mesera: { id: 3, nombre: 'Ana' } }),
  pedido({ id: 3, total: 9999, estado: 'cancelado' })];

describe('kpis (kr original)', () => {
  it('calcula invertido, vendido, ganancia, margen, ticket, cobrado, por cobrar y compras web', () => {
    expect(kpis(rep, peds)).toEqual({ invertido: 20000, vendido: 50000, ganancia: 30000, margen: 60, pedidos: 2, ticket: 25000,
      cobrado: 30000, porCobrar: 20000, web: 1 });
  });
  it('sin ventas no divide por cero', () => {
    expect(kpis({ total: 0, pedidos: 0, compras: 5000 }, [])).toMatchObject({ ganancia: -5000, margen: 0, ticket: 0 });
  });
});

describe('estrellas', () => {
  it('elige el plato y la bebida más vendidos', () => {
    const e = estrellas(rep.porPlato, platos);
    expect(e.plato).toMatchObject({ nombre: 'Pizza', cantidad: 3, emoji: '🍕' });
    expect(e.bebida).toMatchObject({ nombre: 'Gaseosa', cantidad: 1 });
  });
  it('sin ventas no hay estrellas', () => {
    expect(estrellas([], platos)).toEqual({ plato: null, bebida: null });
  });
});

describe('diasDelRango', () => {
  it('completa los días sin ventas con su nombre corto', () => {
    expect(diasDelRango(rep.porDia, '2026-11-21', '2026-11-23')).toEqual([
      { fecha: '2026-11-21', l: 'Sáb', v: 0 }, { fecha: '2026-11-22', l: 'Dom', v: 30000 }, { fecha: '2026-11-23', l: 'Lun', v: 20000 }]);
  });
});

describe('filtrarVentas (vlist original)', () => {
  it('quita los cancelados y busca por plato, mesera o número', () => {
    expect(filtrarVentas(peds, '').map(o => o.id)).toEqual([1, 2]);
    expect(filtrarVentas(peds, 'ana').map(o => o.id)).toEqual([2]);
    expect(filtrarVentas(peds, '#1').map(o => o.id)).toEqual([1]);
    expect(filtrarVentas(peds, 'pizza')).toHaveLength(2);
  });
});
