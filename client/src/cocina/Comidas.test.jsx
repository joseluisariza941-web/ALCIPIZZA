import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Comidas from './Comidas.jsx';
import { mockApi, renderWith } from '../test/helpers.jsx';
import { extras, insumos, platos } from './fixtures.js';

const base = {
  'GET /api/auth/csrf': { csrfToken: 't' }, 'GET /api/admin/platos': platos, 'GET /api/admin/extras': extras, 'GET /api/insumos': insumos,
};
const llamada = (f, metodo, url) => f.mock.calls.find(([u, o]) => u === url && (o?.method || 'GET') === metodo);
const cuerpo = (f, metodo, url) => JSON.parse(llamada(f, metodo, url)[1].body);

beforeEach(() => { vi.stubGlobal('confirm', vi.fn(() => true)); });
afterEach(() => { document.querySelectorAll('.toast:not([role])').forEach(e => e.remove()); });

describe('Comidas: platos y bebidas', () => {
  it('lista los platos con categoría, tamaños, ingredientes y salsas', async () => {
    mockApi(base);
    renderWith(<Comidas />);
    const fila = (await screen.findByText('Pizza', { selector: 'b' })).closest('tr');
    const t = within(fila);
    expect(t.getByText('Pizzas')).toHaveClass('bd');
    expect(t.getByText('Pequeña $16.000')).toHaveClass('pl');
    expect(t.getByText('Queso 100 g')).toHaveClass('pl', 'ig2');
    expect(t.getByText('🥫 Ketchup')).toHaveClass('pl');
    const beb = screen.getByText('Gaseosa', { selector: 'b' }).closest('tr');
    expect(within(beb).getByText('📦 Gaseosa')).toBeInTheDocument();
  });

  it('elimina un plato tras confirmar', async () => {
    const f = mockApi({ ...base, 'DELETE /api/admin/platos/1': { ok: true } });
    renderWith(<Comidas />);
    const fila = (await screen.findByText('Pizza', { selector: 'b' })).closest('tr');
    await userEvent.click(within(fila).getByRole('button', { name: 'Eliminar' }));
    expect(confirm).toHaveBeenCalledWith('¿Eliminar este plato?');
    expect(llamada(f, 'DELETE', '/api/admin/platos/1')).toBeTruthy();
  });

  it('crea un plato nuevo desde el formulario', async () => {
    const f = mockApi({ ...base, 'POST /api/admin/platos': b => ({ status: 201, body: { id: 9, ...b } }) });
    renderWith(<Comidas />);
    await userEvent.click(await screen.findByRole('button', { name: '+ Nuevo plato' }));
    const md = within(screen.getByRole('heading', { name: 'Nuevo plato' }).closest('.card'));
    await userEvent.type(md.getByLabelText('Nombre'), 'Hamburguesa');
    await userEvent.type(md.getByPlaceholderText('Categoría'), 'Hamburguesas');
    await userEvent.type(md.getByPlaceholderText('Tamaño (ej: Mediana)'), 'Sencilla');
    await userEvent.type(md.getByPlaceholderText('Precio'), '12000');
    await userEvent.type(md.getByPlaceholderText('Insumo'), 'Carne');
    await userEvent.type(md.getByPlaceholderText('Cantidad'), '0.15');
    await userEvent.selectOptions(md.getByLabelText('Unidad'), 'kg');
    await userEvent.click(md.getByRole('button', { name: 'Ketchup' }));
    await userEvent.click(md.getByRole('button', { name: 'Queso extra · +$2.000' }));
    await userEvent.click(md.getByRole('button', { name: 'Guardar' }));
    expect(cuerpo(f, 'POST', '/api/admin/platos')).toEqual({
      nombre: 'Hamburguesa', emoji: '🍽️', categoria: 'Hamburguesas', imagenUrl: '',
      variantes: [{ nombre: 'Sencilla', precio: 12000, multiplicador: 1 }],
      ingredientes: [{ insumoId: 2, cantidad: 0.15, unidad: 'kg' }], salsas: ['Ketchup'], extras: [4],
    });
    await vi.waitFor(() => expect(screen.queryByRole('heading', { name: 'Nuevo plato' })).toBeNull());
  });

  it('agrega y quita tamaños', async () => {
    mockApi(base);
    renderWith(<Comidas />);
    await userEvent.click(await screen.findByRole('button', { name: '+ Nuevo plato' }));
    const md = within(screen.getByRole('heading', { name: 'Nuevo plato' }).closest('.card'));
    await userEvent.click(md.getByRole('button', { name: '+ Tamaño' }));
    expect(md.getAllByPlaceholderText('Tamaño (ej: Mediana)')).toHaveLength(2);
    await userEvent.click(md.getAllByRole('button', { name: 'Quitar' })[0]);
    expect(md.getAllByPlaceholderText('Tamaño (ej: Mediana)')).toHaveLength(1);
  });

  it('muestra el error de validación y no envía', async () => {
    const f = mockApi(base);
    renderWith(<Comidas />);
    await userEvent.click(await screen.findByRole('button', { name: '+ Nuevo plato' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Completa nombre, categoría, al menos un tamaño con precio y un ingrediente')).toHaveClass('toast');
    expect(llamada(f, 'POST', '/api/admin/platos')).toBeFalsy();
  });

  it('para bebidas pide el producto del inventario en vez de ingredientes y salsas', async () => {
    mockApi(base);
    renderWith(<Comidas />);
    await userEvent.click(await screen.findByRole('button', { name: '+ Nuevo plato' }));
    await userEvent.type(screen.getByPlaceholderText('Categoría'), 'Bebidas');
    expect(screen.getByLabelText(/Producto del inventario/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Insumo')).toBeNull();
    expect(screen.queryByText(/Salsas que lleva/)).toBeNull();
  });

  it('edita un plato existente con PUT', async () => {
    const f = mockApi({ ...base, 'PUT /api/admin/platos/1': b => ({ id: 1, ...b }) });
    renderWith(<Comidas />);
    const fila = (await screen.findByText('Pizza', { selector: 'b' })).closest('tr');
    await userEvent.click(within(fila).getByRole('button', { name: 'Editar' }));
    const md = within(screen.getByRole('heading', { name: 'Editar plato' }).closest('.card'));
    expect(md.getByLabelText('Nombre')).toHaveValue('Pizza');
    const precio = md.getByPlaceholderText('Precio');
    await userEvent.clear(precio);
    await userEvent.type(precio, '17000');
    await userEvent.click(md.getByRole('button', { name: 'Guardar' }));
    expect(cuerpo(f, 'PUT', '/api/admin/platos/1')).toMatchObject({
      nombre: 'Pizza', variantes: [{ id: 1, nombre: 'Pequeña', precio: 17000, multiplicador: 1 }], salsas: ['Ketchup'], extras: [4],
    });
  });

  it('sube la foto del plato como data URL', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const f = mockApi({ ...base, 'PUT /api/admin/platos/1': b => ({ id: 1, ...b }) });
    renderWith(<Comidas />);
    const fila = (await screen.findByText('Pizza', { selector: 'b' })).closest('tr');
    await userEvent.click(within(fila).getByRole('button', { name: 'Editar' }));
    const file = new File(['x'], 'foto.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Foto del plato o bebida'), { target: { files: [file] } });
    await vi.waitFor(() => expect(document.querySelector('#pvw img')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(cuerpo(f, 'PUT', '/api/admin/platos/1').imagenUrl).toMatch(/^data:image\/png;base64,/);
  });
});

describe('Comidas: extras', () => {
  const abrirExtras = async () => {
    renderWith(<Comidas />);
    await userEvent.click(await screen.findByRole('button', { name: 'Extras' }));
    return screen.findByRole('heading', { name: 'Extras' });
  };

  it('lista los extras con su insumo y edita el precio con PUT', async () => {
    const f = mockApi({ ...base, 'PUT /api/admin/extras/4': b => ({ id: 4, ...b }) });
    await abrirExtras();
    expect(await screen.findByDisplayValue('Queso extra')).toBeInTheDocument();
    expect(screen.getByLabelText('Insumo')).toHaveValue('Queso');
    const precio = screen.getByLabelText('Precio');
    await userEvent.clear(precio);
    await userEvent.type(precio, '2500');
    precio.blur();
    await vi.waitFor(() => expect(llamada(f, 'PUT', '/api/admin/extras/4')).toBeTruthy());
    expect(cuerpo(f, 'PUT', '/api/admin/extras/4')).toEqual({ nombre: 'Queso extra', insumoId: 1, cantidad: 30, unidad: 'g', precio: 2500, grupo: null });
    expect(await screen.findByText('Guardado')).toHaveClass('toast');
  });

  it('elimina un extra tras confirmar', async () => {
    const f = mockApi({ ...base, 'DELETE /api/admin/extras/4': { ok: true } });
    await abrirExtras();
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    expect(confirm).toHaveBeenCalledWith('¿Eliminar este extra?');
    expect(llamada(f, 'DELETE', '/api/admin/extras/4')).toBeTruthy();
  });

  it('quita el extra de un plato desde "Se ofrece en"', async () => {
    const f = mockApi({ ...base, 'PUT /api/admin/platos/1': b => ({ id: 1, ...b }) });
    await abrirExtras();
    const chip = await screen.findByRole('button', { name: '🍕 Pizza', pressed: true });
    await userEvent.click(chip);
    expect(cuerpo(f, 'PUT', '/api/admin/platos/1').extras).toEqual([]);
  });

  it('crea un extra y lo ofrece en los platos elegidos', async () => {
    const f = mockApi({ ...base, 'POST /api/admin/extras': b => ({ status: 201, body: { id: 7, ...b } }), 'PUT /api/admin/platos/2': b => ({ id: 2, ...b }) });
    await abrirExtras();
    const card = within(screen.getByRole('heading', { name: 'Nuevo extra' }).closest('.card'));
    await userEvent.click(card.getByRole('button', { name: '🥤 Gaseosa' }));
    await userEvent.type(card.getByPlaceholderText('Nombre (ej: Queso extra)'), 'Hielo');
    await userEvent.type(card.getByPlaceholderText('Insumo que descuenta'), 'Gaseosa');
    await userEvent.type(card.getByPlaceholderText('Cantidad'), '1');
    await userEvent.selectOptions(card.getByLabelText('Unidad'), 'und');
    await userEvent.type(card.getByPlaceholderText('Precio'), '500');
    await userEvent.click(card.getByRole('button', { name: 'Agregar extra' }));
    expect(cuerpo(f, 'POST', '/api/admin/extras')).toEqual({ nombre: 'Hielo', insumoId: 4, cantidad: 1, unidad: 'und', precio: 500, grupo: null });
    await vi.waitFor(() => expect(llamada(f, 'PUT', '/api/admin/platos/2')).toBeTruthy());
    expect(cuerpo(f, 'PUT', '/api/admin/platos/2').extras).toEqual([7]);
  });
});
