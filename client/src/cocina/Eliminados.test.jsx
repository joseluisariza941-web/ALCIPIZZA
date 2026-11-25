import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Comidas from './Comidas.jsx';
import Inventario from './Inventario.jsx';
import Surtidores from './Surtidores.jsx';
import Personal from './Personal.jsx';
import { mockApi, renderWith } from '../test/helpers.jsx';
import { bitacora, compras, extras, insumos, meseras, platos, surtidores } from './fixtures.js';

const llamada = (f, metodo, url) => f.mock.calls.find(([u, o]) => u === url && (o?.method || 'GET') === metodo);
const csrf = { 'GET /api/auth/csrf': { csrfToken: 't' } };
const solo = (activos, eliminados) => (_b, url) => (url.includes('eliminados=1') ? eliminados : activos);

beforeEach(() => { vi.stubGlobal('confirm', vi.fn(() => true)); });
afterEach(() => { document.querySelectorAll('.toast:not([role])').forEach(e => e.remove()); });

describe('Ver eliminados y restaurar', () => {
  it('platos: lista los eliminados con su fecha y los restaura', async () => {
    const f = mockApi({ ...csrf, 'GET /api/admin/platos': solo(platos, [{ id: 77, nombre: 'Plato viejo', eliminadoEn: '2026-11-20T15:00:00Z' }]),
      'GET /api/admin/extras': extras, 'GET /api/insumos': insumos, 'POST /api/admin/platos/77/restaurar': { id: 77 } });
    renderWith(<Comidas />);
    await screen.findByText('Pizza', { selector: 'b' });
    await userEvent.click(screen.getByRole('button', { name: 'Ver eliminados' }));
    const fila = (await screen.findByText('Plato viejo')).closest('tr');
    expect(fila.textContent).toMatch(/nov/i);
    expect(llamada(f, 'GET', '/api/admin/platos?eliminados=1')).toBeTruthy();
    await userEvent.click(within(fila).getByRole('button', { name: 'Restaurar' }));
    await vi.waitFor(() => expect(llamada(f, 'POST', '/api/admin/platos/77/restaurar')).toBeTruthy());
  });

  it('extras: tiene su propio Ver eliminados', async () => {
    const f = mockApi({ ...csrf, 'GET /api/admin/platos': platos, 'GET /api/admin/extras': solo(extras, [{ id: 55, nombre: 'Extra viejo', eliminadoEn: '2026-11-20T15:00:00Z' }]),
      'GET /api/insumos': insumos, 'POST /api/admin/extras/55/restaurar': { id: 55 } });
    renderWith(<Comidas />);
    await userEvent.click(await screen.findByRole('button', { name: 'Extras' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Ver eliminados' }));
    await userEvent.click(within((await screen.findByText('Extra viejo')).closest('tr')).getByRole('button', { name: 'Restaurar' }));
    await vi.waitFor(() => expect(llamada(f, 'POST', '/api/admin/extras/55/restaurar')).toBeTruthy());
  });

  it('surtidores y personal restauran por su ruta', async () => {
    const f = mockApi({ ...csrf, 'GET /api/surtidores': solo(surtidores, [{ id: 8, nombre: 'Juan Z', eliminadoEn: '2026-11-20T15:00:00Z' }]),
      'GET /api/compras': compras, 'GET /api/insumos': insumos, 'POST /api/surtidores/8/restaurar': { id: 8 } });
    const { unmount } = renderWith(<Surtidores />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ver eliminados' }));
    await userEvent.click(within((await screen.findByText('Juan Z')).closest('tr')).getByRole('button', { name: 'Restaurar' }));
    await vi.waitFor(() => expect(llamada(f, 'POST', '/api/surtidores/8/restaurar')).toBeTruthy());
    unmount();

    const g = mockApi({ ...csrf, 'GET /api/usuarios': solo(meseras, [{ id: 9, nombre: 'Lola', usuario: 'lola', rol: 'mesera', eliminadoEn: '2026-11-20T15:00:00Z' }]),
      'GET /api/bitacora': bitacora, 'POST /api/usuarios/9/restaurar': { id: 9 } });
    renderWith(<Personal />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ver eliminados' }));
    await userEvent.click(within((await screen.findByText('Lola (lola)')).closest('tr')).getByRole('button', { name: 'Restaurar' }));
    await vi.waitFor(() => expect(llamada(g, 'POST', '/api/usuarios/9/restaurar')).toBeTruthy());
  });
});

describe('Inventario: insumo en uso, compras y unidades', () => {
  const base = { ...csrf, 'GET /api/insumos': insumos, 'GET /api/compras': compras, 'GET /api/surtidores': surtidores };

  it('insumo en uso: muestra los platos y reintenta con forzar tras confirmar', async () => {
    let n = 0;
    const f = mockApi({ ...base, 'DELETE /api/insumos/1': () => (++n === 1
      ? { status: 409, body: { error: 'x', code: 'EN_USO', detalles: [{ platoId: 1, plato: 'Perro caliente' }, { platoId: 2, plato: 'Pizza' }] } }
      : { ok: true }) });
    renderWith(<Inventario />);
    const fila = (await screen.findByText('Queso', { selector: 'b' })).closest('tr');
    await userEvent.click(within(fila).getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText('Lo usan: Perro caliente, Pizza')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Quitarlo de esos platos y eliminar' }));
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('Perro caliente, Pizza'));
    await vi.waitFor(() => expect(llamada(f, 'DELETE', '/api/insumos/1?forzar=1')).toBeTruthy());
    await vi.waitFor(() => expect(screen.queryByText(/Lo usan/)).toBeNull());
  });

  it('anula una compra con aviso de que se resta del stock', async () => {
    const f = mockApi({ ...base, 'DELETE /api/compras/1': { ok: true } });
    renderWith(<Inventario />);
    const card = (await screen.findByRole('heading', { name: 'Historial de compras' })).closest('.card');
    await userEvent.click(await within(card).findByRole('button', { name: 'Anular' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Se resta del stock'));
    await vi.waitFor(() => expect(llamada(f, 'DELETE', '/api/compras/1')).toBeTruthy());
  });

  it('Ver anuladas restaura una compra', async () => {
    const f = mockApi({ ...base, 'GET /api/compras': solo(compras, [{ ...compras[0], id: 6, eliminadoEn: '2026-11-21T10:00:00Z' }]),
      'POST /api/compras/6/restaurar': { id: 6 } });
    renderWith(<Inventario />);
    const card = (await screen.findByRole('heading', { name: 'Historial de compras' })).closest('.card');
    await userEvent.click(await within(card).findByRole('button', { name: 'Ver anuladas' }));
    const fila = (await within(card).findByText(/Queso · 1 kg/)).closest('tr');
    await userEvent.click(within(fila).getByRole('button', { name: 'Restaurar' }));
    await vi.waitFor(() => expect(llamada(f, 'POST', '/api/compras/6/restaurar')).toBeTruthy());
  });

  it('filtro del historial: Todo y Archivadas piden archivados=incluir|solo', async () => {
    const f = mockApi({ ...base, 'GET /api/compras': solo(compras, compras) });
    renderWith(<Inventario />);
    const card = (await screen.findByRole('heading', { name: 'Historial de compras' })).closest('.card');
    await userEvent.click(within(card).getByRole('button', { name: 'Todo' }));
    await vi.waitFor(() => expect(llamada(f, 'GET', '/api/compras?archivados=incluir')).toBeTruthy());
    await userEvent.click(within(card).getByRole('button', { name: 'Archivadas' }));
    await vi.waitFor(() => expect(llamada(f, 'GET', '/api/compras?archivados=solo')).toBeTruthy());
  });

  it('el selector de unidad ofrece Litros (L) y ml', async () => {
    const f = mockApi({ ...base, 'POST /api/compras': b => ({ status: 201, body: { id: 5, ...b } }) });
    renderWith(<Inventario />);
    await screen.findByText('Queso', { selector: 'b' });
    const sel = screen.getByLabelText('Unidad');
    expect([...sel.options].map(o => o.textContent)).toEqual(['und', 'g', 'kg', 'lb', 'Litros', 'ml']);
    await userEvent.type(screen.getByPlaceholderText('Producto (nuevo o existente)'), 'Leche');
    await userEvent.type(screen.getByPlaceholderText('Cantidad'), '2');
    await userEvent.selectOptions(sel, 'Litros');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar en inventario' }));
    await vi.waitFor(() => expect(llamada(f, 'POST', '/api/compras')).toBeTruthy());
    expect(JSON.parse(llamada(f, 'POST', '/api/compras')[1].body)).toMatchObject({ unidad: 'L', nuevoInsumo: { unidad: 'L' } });
  });
});
