import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Personal from './Personal.jsx';
import { mockApi, renderWith } from '../test/helpers.jsx';
import { bitacora, meseras } from './fixtures.js';

const base = { 'GET /api/auth/csrf': { csrfToken: 't' }, 'GET /api/usuarios': meseras, 'GET /api/bitacora': bitacora };
const llamada = (f, metodo, url) => f.mock.calls.find(([u, o]) => String(u).split('?')[0] === url && (o?.method || 'GET') === metodo);
const cuerpo = (f, metodo, url) => JSON.parse(llamada(f, metodo, url)[1].body);
const tarjeta = async () => within((await screen.findByRole('heading', { name: 'Meseras' })).closest('.card'));

beforeEach(() => { vi.stubGlobal('confirm', vi.fn(() => true)); });
afterEach(() => { document.querySelectorAll('.toast:not([role])').forEach(e => e.remove()); });

describe('Pestaña Personal: meseras', () => {
  it('lista las meseras sin mostrar contraseñas', async () => {
    mockApi(base);
    renderWith(<Personal />);
    const c = await tarjeta();
    expect(await c.findByDisplayValue('Ana')).toBeInTheDocument();
    expect(c.getByDisplayValue('ana')).toBeInTheDocument();
    const clave = c.getByLabelText('Nueva contraseña de Ana');
    expect(clave).toHaveAttribute('type', 'password');
    expect(clave).toHaveValue('');
  });

  it('crea una mesera con POST /api/usuarios', async () => {
    const f = mockApi({ ...base, 'POST /api/usuarios': b => ({ status: 201, body: { id: 5, ...b } }) });
    renderWith(<Personal />);
    const c = await tarjeta();
    await userEvent.type(c.getByPlaceholderText('Nombre'), 'Luz');
    await userEvent.type(c.getByPlaceholderText('Usuario'), 'Luz');
    await userEvent.type(c.getByPlaceholderText('Contraseña'), 'secreta123');
    await userEvent.click(c.getByRole('button', { name: 'Agregar mesera' }));
    expect(cuerpo(f, 'POST', '/api/usuarios')).toEqual({ nombre: 'Luz', usuario: 'luz', clave: 'secreta123', rol: 'mesera' });
    await vi.waitFor(() => expect(c.getByPlaceholderText('Contraseña')).toHaveValue(''));
  });

  it('valida antes de crear', async () => {
    const f = mockApi(base);
    renderWith(<Personal />);
    const c = await tarjeta();
    await c.findByDisplayValue('Ana');
    await userEvent.type(c.getByPlaceholderText('Nombre'), 'Otra');
    await userEvent.type(c.getByPlaceholderText('Usuario'), 'ana');
    await userEvent.type(c.getByPlaceholderText('Contraseña'), 'secreta123');
    await userEvent.click(c.getByRole('button', { name: 'Agregar mesera' }));
    expect(await screen.findByText('Datos incompletos o usuario repetido')).toHaveClass('toast');
    expect(llamada(f, 'POST', '/api/usuarios')).toBeFalsy();
  });

  it('muestra el 409 del servidor', async () => {
    mockApi({ ...base, 'POST /api/usuarios': { status: 409, body: { error: 'Ese usuario ya existe' } } });
    renderWith(<Personal />);
    const c = await tarjeta();
    await userEvent.type(c.getByPlaceholderText('Nombre'), 'Luz');
    await userEvent.type(c.getByPlaceholderText('Usuario'), 'luz');
    await userEvent.type(c.getByPlaceholderText('Contraseña'), 'secreta123');
    await userEvent.click(c.getByRole('button', { name: 'Agregar mesera' }));
    expect(await screen.findByText('Ese usuario ya existe')).toHaveClass('toast');
  });

  it('edita el nombre y cambia la clave con PUT', async () => {
    const f = mockApi({ ...base, 'PUT /api/usuarios/3': b => ({ ...meseras[0], ...b }) });
    renderWith(<Personal />);
    const c = await tarjeta();
    const nombre = await c.findByDisplayValue('Ana');
    await userEvent.clear(nombre);
    await userEvent.type(nombre, 'Ana María');
    nombre.blur();
    await vi.waitFor(() => expect(llamada(f, 'PUT', '/api/usuarios/3')).toBeTruthy());
    expect(cuerpo(f, 'PUT', '/api/usuarios/3')).toEqual({ nombre: 'Ana María' });
    expect(await screen.findByText('Guardado')).toHaveClass('toast');
    f.mockClear();
    const clave = c.getByLabelText(/Nueva contraseña de/);
    await userEvent.type(clave, 'otraclave1');
    clave.blur();
    await vi.waitFor(() => expect(llamada(f, 'PUT', '/api/usuarios/3')).toBeTruthy());
    expect(cuerpo(f, 'PUT', '/api/usuarios/3')).toEqual({ clave: 'otraclave1' });
    await vi.waitFor(() => expect(clave).toHaveValue(''));
  });

  it('quita una mesera tras confirmar', async () => {
    const f = mockApi({ ...base, 'DELETE /api/usuarios/3': { ok: true } });
    renderWith(<Personal />);
    const c = await tarjeta();
    await c.findByDisplayValue('Ana');
    await userEvent.click(c.getByRole('button', { name: 'Quitar' }));
    expect(confirm).toHaveBeenCalledWith('¿Quitar a Ana?');
    expect(llamada(f, 'DELETE', '/api/usuarios/3')).toBeTruthy();
  });
});

describe('Pestaña Personal: bitácora', () => {
  it('muestra los ingresos y acciones del personal', async () => {
    const f = mockApi(base);
    renderWith(<Personal />);
    const fila = (await screen.findByText('Ingresó al sistema')).closest('tr');
    expect(within(fila).getByText('Ana')).toBeInTheDocument();
    expect(f.mock.calls.some(([u]) => u === '/api/bitacora?limit=200')).toBe(true);
  });

  it('sin registros', async () => {
    mockApi({ ...base, 'GET /api/bitacora': [] });
    renderWith(<Personal />);
    expect(await screen.findByText('Aún no hay registros')).toBeInTheDocument();
  });
});
