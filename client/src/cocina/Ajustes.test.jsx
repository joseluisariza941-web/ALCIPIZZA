import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Ajustes from './Ajustes.jsx';
import { mockApi, renderWith } from '../test/helpers.jsx';
import { config, metodos } from './fixtures.js';

const base = { 'GET /api/auth/csrf': { csrfToken: 't' }, 'GET /api/config': config, 'GET /api/metodos-pago': metodos };
const llamada = (f, metodo, url) => f.mock.calls.find(([u, o]) => u === url && (o?.method || 'GET') === metodo);
const cuerpo = (f, metodo, url) => JSON.parse(llamada(f, metodo, url)[1].body);
const card = async t => within((await screen.findByRole('heading', { name: t })).closest('.card'));

afterEach(() => { document.querySelectorAll('.toast:not([role])').forEach(e => e.remove()); });

describe('Pestaña Ajustes', () => {
  it('muestra los textos y guarda los cambios con PUT /api/config', async () => {
    const f = mockApi({ ...base, 'PUT /api/config': b => ({ ...config, ...b }) });
    renderWith(<Ajustes />);
    const nombre = await screen.findByLabelText('Nombre del negocio');
    expect(nombre).toHaveValue('Alcipizza');
    expect(screen.getByLabelText('Sello (Todo a tu gusto)')).toHaveValue('Todo a tu gusto');
    await userEvent.clear(nombre);
    await userEvent.type(nombre, 'Alci');
    const tel = screen.getByLabelText('Teléfono y WhatsApp');
    await userEvent.clear(tel);
    await userEvent.type(tel, '3110000000');
    await userEvent.click(screen.getByRole('button', { name: '💾 Guardar cambios' }));
    const b = cuerpo(f, 'PUT', '/api/config');
    expect(b).toMatchObject({ n: 'Alci', tel: '3110000000', mesas: 8, w4: 'Todo a tu gusto' });
    expect(b).not.toHaveProperty('logo');
    expect(await screen.findByText('✅ Cambios guardados')).toHaveClass('toast');
  });

  it('edita horarios de lunes a domingo; vacío es cerrado', async () => {
    const f = mockApi({ ...base, 'PUT /api/config': b => ({ ...config, ...b }) });
    renderWith(<Ajustes />);
    const h = await screen.findByRole('heading', { name: 'Horarios' });
    const filas = h.closest('.card').querySelectorAll('.fg');
    expect([...filas].map(x => x.querySelector('b').textContent)).toEqual(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']);
    const martes = within(/** @type {HTMLElement} */ (filas[1]));
    expect(martes.getByLabelText('Abre')).toHaveValue(null);
    await userEvent.type(martes.getByLabelText('Abre'), '17');
    await userEvent.clear(within(/** @type {HTMLElement} */ (filas[0])).getByLabelText('Cierra'));
    await userEvent.click(screen.getByRole('button', { name: '💾 Guardar cambios' }));
    const b = cuerpo(f, 'PUT', '/api/config');
    expect(b.h[0]).toBeNull();
    expect(b.h[1]).toEqual([17, 22]);
  });

  it('cantidad de mesas mínima 1', async () => {
    const f = mockApi({ ...base, 'PUT /api/config': b => ({ ...config, ...b }) });
    renderWith(<Ajustes />);
    const m = await screen.findByLabelText('Cantidad de mesas');
    await userEvent.clear(m);
    await userEvent.type(m, '0');
    await userEvent.click(screen.getByRole('button', { name: '💾 Guardar cambios' }));
    expect(cuerpo(f, 'PUT', '/api/config').mesas).toBe(1);
  });

  it('métodos de pago: activa/desactiva y cambia el número; efectivo no lleva número', async () => {
    const f = mockApi({ ...base, 'PUT /api/metodos-pago/nq': b => ({ codigo: 'nq', ...b }) });
    renderWith(<Ajustes />);
    const mp = await card('Métodos de pago');
    const nequi = await screen.findByRole('checkbox', { name: 'Nequi' });
    expect(nequi).toBeChecked();
    expect(mp.getAllByPlaceholderText('Número de cuenta/celular')).toHaveLength(1);
    await userEvent.click(nequi);
    expect(cuerpo(f, 'PUT', '/api/metodos-pago/nq')).toEqual({ nombre: 'Nequi', numero: '3001112222', activo: false });
    f.mockClear();
    const num = mp.getByPlaceholderText('Número de cuenta/celular');
    await userEvent.clear(num);
    await userEvent.type(num, '311');
    num.blur();
    await vi.waitFor(() => expect(llamada(f, 'PUT', '/api/metodos-pago/nq')).toBeTruthy());
    expect(cuerpo(f, 'PUT', '/api/metodos-pago/nq').numero).toBe('311');
  });

  it('sube el logo al instante y puede volver al original', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const f = mockApi({ ...base, 'PUT /api/config': b => ({ ...config, ...b }) });
    renderWith(<Ajustes />);
    const lg = await card('Logo del local');
    expect(await lg.findByAltText('Logo actual')).toHaveAttribute('src', '/assets/logo.png');
    fireEvent.change(lg.getByLabelText('Subir logo'), { target: { files: [new File(['x'], 'l.png', { type: 'image/png' })] } });
    await vi.waitFor(() => expect(llamada(f, 'PUT', '/api/config')).toBeTruthy());
    expect(cuerpo(f, 'PUT', '/api/config')).toEqual({ logo: expect.stringMatching(/^data:image\/png;base64,/) });
    expect(await screen.findByText('Logo actualizado')).toHaveClass('toast');
    f.mockClear();
    await userEvent.click(lg.getByRole('button', { name: 'Usar el logo original' }));
    expect(cuerpo(f, 'PUT', '/api/config')).toEqual({ logo: '' });
  });

  it('quita el fondo de pantalla', async () => {
    const f = mockApi({ ...base, 'GET /api/config': { ...config, bg: 'data:image/jpeg;base64,AA' }, 'PUT /api/config': b => ({ ...config, ...b }) });
    renderWith(<Ajustes />);
    await userEvent.click(await screen.findByRole('button', { name: 'Quitar fondo' }));
    expect(cuerpo(f, 'PUT', '/api/config')).toEqual({ bg: '' });
  });
});
