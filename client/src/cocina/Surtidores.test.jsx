import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Surtidores from './Surtidores.jsx';
import { mockApi, renderWith } from '../test/helpers.jsx';
import { compras, insumos, surtidores } from './fixtures.js';

const base = { 'GET /api/auth/csrf': { csrfToken: 't' }, 'GET /api/surtidores': surtidores, 'GET /api/compras': compras, 'GET /api/insumos': insumos };
const llamada = (f, metodo, url) => f.mock.calls.find(([u, o]) => u === url && (o?.method || 'GET') === metodo);
const cuerpo = (f, metodo, url) => JSON.parse(llamada(f, metodo, url)[1].body);

beforeEach(() => { vi.stubGlobal('confirm', vi.fn(() => true)); });
afterEach(() => { document.querySelectorAll('.toast:not([role])').forEach(e => e.remove()); });

describe('Pestaña Surtidores', () => {
  it('lista los surtidores con productos y total comprado', async () => {
    mockApi(base);
    renderWith(<Surtidores />);
    const fila = (await screen.findByDisplayValue('Pedro')).closest('tr');
    const t = within(fila);
    expect(t.getByLabelText('Empresa')).toHaveValue('Lácteos SA');
    expect(t.getByText('Queso')).toBeInTheDocument();
    expect(t.getByText('$20.000')).toBeInTheDocument();
  });

  it('crea un surtidor con POST', async () => {
    const f = mockApi({ ...base, 'POST /api/surtidores': b => ({ status: 201, body: { id: 2, ...b } }) });
    renderWith(<Surtidores />);
    await userEvent.type(await screen.findByPlaceholderText('Nombre del surtidor'), 'Luis');
    await userEvent.type(screen.getByPlaceholderText('Empresa que representa'), 'Carnes');
    await userEvent.type(within(screen.getByRole('heading', { name: 'Nuevo surtidor' }).closest('.card')).getByPlaceholderText('Teléfono / WhatsApp'), '320');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar surtidor' }));
    expect(cuerpo(f, 'POST', '/api/surtidores')).toEqual({ nombre: 'Luis', empresa: 'Carnes', correo: '', telefono: '320' });
    await vi.waitFor(() => expect(screen.getByPlaceholderText('Nombre del surtidor')).toHaveValue(''));
  });

  it('sin nombre muestra el error y no envía', async () => {
    const f = mockApi(base);
    renderWith(<Surtidores />);
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar surtidor' }));
    expect(await screen.findByText('Escribe el nombre del surtidor')).toHaveClass('toast');
    expect(llamada(f, 'POST', '/api/surtidores')).toBeFalsy();
  });

  it('edita en línea con PUT al salir del campo', async () => {
    const f = mockApi({ ...base, 'PUT /api/surtidores/1': b => ({ id: 1, ...b }) });
    renderWith(<Surtidores />);
    const fila = within((await screen.findByDisplayValue('Pedro')).closest('tr'));
    const tel = fila.getByLabelText('Teléfono');
    await userEvent.clear(tel);
    await userEvent.type(tel, '399');
    tel.blur();
    await vi.waitFor(() => expect(llamada(f, 'PUT', '/api/surtidores/1')).toBeTruthy());
    expect(cuerpo(f, 'PUT', '/api/surtidores/1')).toEqual({ nombre: 'Pedro', empresa: 'Lácteos SA', correo: 'p@l.co', telefono: '399' });
  });

  it('elimina tras confirmar', async () => {
    const f = mockApi({ ...base, 'DELETE /api/surtidores/1': { ok: true } });
    renderWith(<Surtidores />);
    await screen.findByDisplayValue('Pedro');
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('se puede restaurar'));
    expect(llamada(f, 'DELETE', '/api/surtidores/1')).toBeTruthy();
  });

  it('busca y muestra "Sin surtidores" si no hay resultados', async () => {
    mockApi(base);
    renderWith(<Surtidores />);
    await screen.findByDisplayValue('Pedro');
    await userEvent.type(screen.getByPlaceholderText('🔎 Buscar surtidor o producto'), 'zzz');
    expect(screen.getByText('Sin surtidores')).toBeInTheDocument();
  });
});
