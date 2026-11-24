import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Reporte from './Reporte.jsx';
import { mockApi, renderWith } from '../test/helpers.jsx';
import { compras, pedido, platos } from './fixtures.js';
import { rangoSemana } from './util.js';

const rep = { total: 50000, pedidos: 2, compras: 20000, porPlato: [{ nombre: 'Pizza', cantidad: 3, total: 48000 }],
  porMetodo: [{ metodo: 'Nequi', total: 50000 }], porDia: [] };
const peds = [pedido({ id: 1, total: 30000, pagoEstado: 'pagado' }), pedido({ id: 2, total: 20000, origen: 'mesera', mesera: { id: 3, nombre: 'Ana' } })];
const base = { 'GET /api/auth/csrf': { csrfToken: 't' }, 'GET /api/reportes/ventas': rep, 'GET /api/pedidos': peds,
  'GET /api/compras': compras, 'GET /api/admin/platos': platos };
const kpi = l => screen.getByText(l, { selector: '.kpi p' }).closest('.kpi').querySelector('h3').textContent;

afterEach(() => { vi.useRealTimers(); });

describe('Pestaña Reporte', () => {
  it('pide el reporte de la semana y muestra los indicadores del original', async () => {
    const f = mockApi(base);
    renderWith(<Reporte />);
    await screen.findByRole('heading', { name: 'Reporte de la semana' });
    await vi.waitFor(() => expect(kpi('Vendido')).toBe('$50.000'));
    const { desde, hasta } = rangoSemana();
    expect(f.mock.calls.some(([u]) => u === `/api/reportes/ventas?desde=${desde}&hasta=${hasta}`)).toBe(true);
    expect(f.mock.calls.some(([u]) => u === `/api/pedidos?desde=${desde}&hasta=${hasta}`)).toBe(true);
    expect(kpi('Invertido')).toBe('$20.000');
    expect(kpi('Ganancia')).toBe('$30.000');
    expect(kpi('Margen')).toBe('60%');
    expect(kpi('Pedidos')).toBe('2');
    expect(kpi('Ticket promedio')).toBe('$25.000');
    expect(kpi('Cobrado')).toBe('$30.000');
    expect(kpi('Por cobrar')).toBe('$20.000');
    expect(kpi('Compras web')).toBe('1');
  });

  it('muestra el plato estrella y la bebida sin ventas', async () => {
    mockApi(base);
    renderWith(<Reporte />);
    const p = (await screen.findByText('⭐ Plato estrella')).closest('.star');
    expect(await within(p).findByRole('heading', { name: 'Pizza' })).toBeInTheDocument();
    expect(within(p).getByText('3 vendido(s) en el periodo')).toBeInTheDocument();
    const b = screen.getByText('⭐ Bebida estrella').closest('.star');
    expect(within(b).getByRole('heading', { name: 'Aún sin ventas' })).toBeInTheDocument();
  });

  it('muestra inversión vs. ganancia, ventas por método y por plato', async () => {
    mockApi(base);
    renderWith(<Reporte />);
    const c = within((await screen.findByRole('heading', { name: 'Inversión vs. ganancia' })).closest('.card'));
    await c.findByText('Vendido $50.000');
    expect(c.getByText('Invertido $20.000')).toBeInTheDocument();
    const met = within(screen.getByRole('heading', { name: 'Ventas por método de pago' }).closest('.card'));
    expect(met.getByText('Nequi').closest('tr')).toHaveTextContent('$50.000');
    const pl = within(screen.getByRole('heading', { name: 'Ventas por plato' }).closest('.card'));
    expect(pl.getByText('Pizza').closest('tr')).toHaveTextContent('3');
  });

  it('historial de ventas con búsqueda', async () => {
    mockApi(base);
    renderWith(<Reporte />);
    const c = within((await screen.findByRole('heading', { name: 'Historial de ventas' })).closest('.card'));
    expect(await c.findByText('#1')).toBeInTheDocument();
    expect(c.getByText('Mesera Ana')).toBeInTheDocument();
    await userEvent.type(c.getByPlaceholderText('🔎 Buscar venta (plato, mesera, método, fecha…)'), 'ana');
    expect(c.queryByText('#1')).toBeNull();
    expect(c.getByText('#2')).toBeInTheDocument();
  });

  it('historial de compras de insumos', async () => {
    mockApi(base);
    renderWith(<Reporte />);
    const c = within((await screen.findByRole('heading', { name: 'Historial de compra de insumos' })).closest('.card'));
    expect(await c.findByText('Queso')).toBeInTheDocument();
  });

  it('cambia el rango de fechas y vuelve a consultar', async () => {
    const f = mockApi(base);
    renderWith(<Reporte />);
    await screen.findByRole('heading', { name: 'Reporte de la semana' });
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-15' } });
    await vi.waitFor(() => expect(f.mock.calls.some(([u]) => u === '/api/reportes/ventas?desde=2026-11-01&hasta=2026-11-15')).toBe(true));
    expect(screen.getByRole('heading', { name: 'Reporte del periodo' })).toBeInTheDocument();
  });
});
