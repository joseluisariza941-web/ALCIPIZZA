import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Inventario from './Inventario.jsx';
import { mockApi, renderWith } from '../test/helpers.jsx';
import { compras, insumos, surtidores } from './fixtures.js';

const base = {
  'GET /api/auth/csrf': { csrfToken: 't' }, 'GET /api/insumos': insumos, 'GET /api/compras': compras, 'GET /api/surtidores': surtidores,
};
const llamada = (f, metodo, url) => f.mock.calls.find(([u, o]) => u === url && (o?.method || 'GET') === metodo);

beforeEach(() => { vi.stubGlobal('confirm', vi.fn(() => true)); });
afterEach(() => { document.querySelectorAll('.toast:not([role])').forEach(e => e.remove()); });

describe('Pestaña Inventario', () => {
  it('lista insumos y salsas por separado con surtidor, costo y total invertido', async () => {
    mockApi(base);
    renderWith(<Inventario />);
    const tInsumos = (await screen.findByRole('heading', { name: 'Insumos' })).closest('.card');
    const tSalsas = screen.getByRole('heading', { name: 'Salsas' }).closest('.card');
    expect(within(tInsumos).getByText('Queso')).toBeInTheDocument();
    expect(within(tInsumos).queryByText('Ketchup')).toBeNull();
    expect(within(tSalsas).getByText('Ketchup')).toBeInTheDocument();
    const fila = within(tInsumos).getByText('Queso').closest('tr');
    expect(within(fila).getByText('Pedro')).toBeInTheDocument();
    expect(within(fila).getByText('$20.000')).toBeInTheDocument();
    expect(within(fila).getByText('Admin')).toBeInTheDocument();
    expect(within(fila).getByLabelText('Cantidad de Queso')).toHaveValue(100);
    expect(screen.getByText('$20.000', { selector: 'b' })).toBeInTheDocument();
  });

  it('marca con ⚠️ el stock bajo frente a la referencia y dibuja el nivel', async () => {
    mockApi(base);
    renderWith(<Inventario />);
    const fq = (await screen.findByText('Queso', { selector: 'b' })).closest('tr');
    expect(fq.textContent).toContain('⚠️');
    expect(fq.querySelector('.bar i').style.width).toBe('10%');
    const fc = screen.getByText('Carne', { selector: 'b' }).closest('tr');
    expect(fc.textContent).not.toContain('⚠️');
  });

  it('edita la cantidad con PUT /api/insumos/:id', async () => {
    const f = mockApi({ ...base, 'PUT /api/insumos/2': b => ({ id: 2, ...b }) });
    renderWith(<Inventario />);
    const inp = await screen.findByLabelText('Cantidad de Carne');
    await userEvent.clear(inp);
    await userEvent.type(inp, '7');
    inp.blur();
    await vi.waitFor(() => expect(llamada(f, 'PUT', '/api/insumos/2')).toBeTruthy());
    expect(JSON.parse(llamada(f, 'PUT', '/api/insumos/2')[1].body)).toMatchObject({ nombre: 'Carne', stock: 7, unidad: 'kg' });
  });

  it('borra un insumo tras confirmar y muestra el error 409 si un plato lo usa', async () => {
    const f = mockApi({ ...base, 'DELETE /api/insumos/1': { status: 409, body: { error: 'Un plato usa este insumo' } } });
    renderWith(<Inventario />);
    const fila = (await screen.findByText('Queso', { selector: 'b' })).closest('tr');
    await userEvent.click(within(fila).getByRole('button', { name: 'Eliminar' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('se puede restaurar'));
    expect(llamada(f, 'DELETE', '/api/insumos/1')).toBeTruthy();
    expect(await screen.findByText('Un plato usa este insumo')).toHaveClass('toast');
  });

  it('registra una compra de un producto nuevo y recarga', async () => {
    let lista = insumos;
    const f = mockApi({ ...base, 'GET /api/insumos': () => lista,
      'POST /api/compras': b => { lista = [...insumos, { id: 9, nombre: 'Tomate', tipo: 'insumo', unidad: 'g', stock: 500, stockReferencia: 500, costo: 4000, surtidorId: 1 }]; return { status: 201, body: { id: 5, ...b } }; } });
    renderWith(<Inventario />);
    await screen.findByText('Queso', { selector: 'b' });
    await userEvent.type(screen.getByPlaceholderText('Producto (nuevo o existente)'), 'Tomate');
    await userEvent.type(screen.getByPlaceholderText('Cantidad'), '500');
    await userEvent.selectOptions(screen.getByLabelText('Unidad'), 'g');
    await userEvent.type(screen.getByPlaceholderText('Costo total COP'), '4000');
    await userEvent.selectOptions(screen.getByLabelText('Surtidor'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar en inventario' }));
    expect(JSON.parse(llamada(f, 'POST', '/api/compras')[1].body)).toEqual({
      nuevoInsumo: { nombre: 'Tomate', tipo: 'insumo', unidad: 'g' }, cantidad: 500, unidad: 'g', costo: 4000, surtidorId: 1,
    });
    expect(await screen.findByText('Producto creado y guardado')).toHaveClass('toast');
    expect(await screen.findByText('Tomate', { selector: 'b' })).toBeInTheDocument();
  });

  it('valida el formulario de compra antes de enviar', async () => {
    const f = mockApi(base);
    renderWith(<Inventario />);
    await screen.findByText('Queso', { selector: 'b' });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar en inventario' }));
    expect(await screen.findByText('Escribe el producto')).toHaveClass('toast');
    expect(llamada(f, 'POST', '/api/compras')).toBeFalsy();
  });

  it('historial de compras con búsqueda', async () => {
    mockApi(base);
    renderWith(<Inventario />);
    const card = (await screen.findByRole('heading', { name: 'Historial de compras' })).closest('.card');
    expect(await within(card).findByText('1 kg')).toBeInTheDocument();
    await userEvent.type(within(card).getByPlaceholderText('🔎 Buscar compra'), 'zzz');
    expect(within(card).getByText('Sin compras registradas')).toBeInTheDocument();
  });
});
