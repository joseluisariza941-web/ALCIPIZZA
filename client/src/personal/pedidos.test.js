import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { avisosListos, historial } from './pedidos.js';
import { usePolling } from './usePolling.js';

const p = (id, o) => ({ id, origen: 'mesera', mesera: { id: 3, nombre: 'Ana' }, destino: 'Mesa 1', estado: 'nuevo', ...o });

describe('historial de la mesera', () => {
  it('separa listos, compras web (sin canceladas) y mis pedidos', () => {
    const lista = [
      p(6, { estado: 'listo' }),
      p(5, { origen: 'web', mesera: null, estado: 'cancelado' }),
      p(4, { origen: 'web', mesera: null, estado: 'listo' }),
      p(3, { mesera: { id: 9, nombre: 'Luz' }, estado: 'listo' }),
      p(2),
    ];
    const h = historial(lista, 3);
    expect(h.listos.map(x => x.id)).toEqual([6, 4]);
    expect(h.web.map(x => x.id)).toEqual([4]);
    expect(h.mios.map(x => x.id)).toEqual([6, 2]);
  });

  it('avisa solo de los pedidos propios o web que acaban de pasar a listo', () => {
    const antes = [p(1, { estado: 'preparando' }), p(2, { origen: 'web', mesera: null, estado: 'preparando', destino: 'Domicilio' }), p(3, { mesera: { id: 9 }, estado: 'preparando' }), p(4, { estado: 'listo' })];
    const ahora = [p(1, { estado: 'listo' }), p(2, { origen: 'web', mesera: null, estado: 'listo', destino: 'Domicilio' }), p(3, { mesera: { id: 9 }, estado: 'listo' }), p(4, { estado: 'listo' }), p(5, { estado: 'listo' })];
    expect(avisosListos(antes, ahora, 3)).toEqual(['✅ Pedido #1 listo para Mesa 1', '✅ Pedido #2 listo para Domicilio · COMPRA WEB, cobrar']);
  });
});

describe('usePolling', () => {
  afterEach(() => vi.useRealTimers());
  it('llama al montar y luego cada intervalo; se detiene al desmontar', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const { unmount } = renderHook(() => usePolling(fn, 5000));
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(10000);
    expect(fn).toHaveBeenCalledTimes(4);
    unmount();
    vi.advanceTimersByTime(10000);
    expect(fn).toHaveBeenCalledTimes(4);
  });
});
