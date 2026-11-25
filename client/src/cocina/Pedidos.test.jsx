import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import CocinaPage from '../pages/CocinaPage.jsx';
import { mockApi, renderWith } from '../test/helpers.jsx';
import { cocinero, config, pedido } from './fixtures.js';

const base = { 'GET /api/auth/csrf': { csrfToken: 't' }, 'GET /api/config': config, 'GET /api/public/config': { config, pagos: [], abierto: true, suscripcionActiva: true } };
const pagina = (route = '/cocina') => renderWith(
  <Routes><Route path="/cocina/*" element={<CocinaPage />} /></Routes>, { route, user: cocinero });

beforeEach(() => { vi.stubGlobal('confirm', vi.fn(() => true)); });
afterEach(() => { document.querySelectorAll('.toast:not([role])').forEach(e => e.remove()); vi.useRealTimers(); });

describe('Panel de cocina: marco y pestañas', () => {
  it('muestra las pestañas del original con el conteo de pedidos activos', async () => {
    mockApi({ ...base, 'GET /api/pedidos': [pedido({ id: 1 }), pedido({ id: 2, estado: 'preparando' }), pedido({ id: 3, estado: 'listo' })] });
    pagina();
    expect(await screen.findByRole('button', { name: 'Pedidos (2)' })).toHaveClass('btn', 's', 'y');
    for (const t of ['Inventario', 'Surtidores', 'Comidas', 'Reporte', 'Personal', 'Ajustes'])
      expect(screen.getByRole('button', { name: t })).toBeInTheDocument();
    expect(screen.getByTestId('pagina-cocina')).toBeInTheDocument();
  });

  it('cambia de pestaña con rutas anidadas', async () => {
    mockApi({ ...base, 'GET /api/pedidos': [], 'GET /api/insumos': [], 'GET /api/compras': [], 'GET /api/surtidores': [] });
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Inventario' }));
    expect(await screen.findByRole('heading', { name: 'Inventario' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inventario' })).toHaveClass('y');
  });

  it('muestra el nombre y cierra sesión con Salir', async () => {
    mockApi({ ...base, 'GET /api/pedidos': [] });
    const { auth } = pagina();
    expect(await screen.findByText('Admin')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(auth.logout).toHaveBeenCalled();
  });
});

describe('Pestaña Pedidos', () => {
  it('sin pedidos muestra el mensaje original', async () => {
    mockApi({ ...base, 'GET /api/pedidos': [] });
    pagina();
    expect(await screen.findByText('Sin pedidos por ahora. Cuando llegue uno, suena la campana.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'En cocina' })).toBeInTheDocument();
  });

  it('muestra el detalle del pedido: destino, ítems, sin, salsas, extras, nota y pago', async () => {
    mockApi({ ...base, 'GET /api/pedidos': [pedido()] });
    pagina();
    const tk = (await screen.findByRole('heading', { name: '#1' })).closest('.tk');
    const t = within(tk);
    expect(t.getByText('🌐 Web')).toBeInTheDocument();
    expect(t.getByText('Domicilio')).toBeInTheDocument();
    expect(t.getByText(/1× 🍕 Pizza \(Pequeña\)/)).toBeInTheDocument();
    expect(t.getByText('SIN Tomate')).toBeInTheDocument();
    expect(t.getByText('+ Queso extra')).toBeInTheDocument();
    expect(t.getByText('SALSAS: Ketchup')).toBeInTheDocument();
    expect(t.getByText('“bien asada”')).toBeInTheDocument();
    expect(t.getByText('$21.000')).toBeInTheDocument();
    expect(t.getByText('⏳ Cobro pendiente')).toBeInTheDocument();
  });

  it('muestra pagado con el método y la mesera', async () => {
    mockApi({ ...base, 'GET /api/pedidos': [pedido({ origen: 'mesera', mesera: { id: 3, nombre: 'Ana' }, pagoEstado: 'pagado' })] });
    pagina();
    expect(await screen.findByText('✅ Pagado · Nequi')).toBeInTheDocument();
    expect(screen.getByText('🧑‍🍳 Ana')).toBeInTheDocument();
  });

  it('cuenta los pedidos listos esperando entrega', async () => {
    mockApi({ ...base, 'GET /api/pedidos': [pedido({ id: 5, estado: 'listo' }), pedido({ id: 6, estado: 'entregado' })] });
    pagina();
    expect(await screen.findByText('1 pedido(s) listo(s) esperando entrega.')).toBeInTheDocument();
  });

  it('avanza el estado: Preparar envía PATCH preparando y recarga', async () => {
    let lista = [pedido()];
    const f = mockApi({
      ...base,
      'GET /api/pedidos': () => lista,
      'PATCH /api/pedidos/1/estado': b => { lista = [pedido({ estado: b.estado })]; return lista[0]; },
    });
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Preparar' }));
    const call = f.mock.calls.find(([u, o]) => u === '/api/pedidos/1/estado' && o.method === 'PATCH');
    expect(JSON.parse(call[1].body)).toEqual({ estado: 'preparando' });
    expect(await screen.findByRole('button', { name: 'Finalizar y avisar' })).toBeInTheDocument();
  });

  it('los listos se marcan como entregados', async () => {
    let lista = [pedido({ estado: 'listo' })];
    const f = mockApi({
      ...base,
      'GET /api/pedidos': () => lista,
      'PATCH /api/pedidos/1/estado': b => { lista = [pedido({ estado: b.estado })]; return lista[0]; },
    });
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Entregado' }));
    const call = f.mock.calls.find(([u, o]) => u === '/api/pedidos/1/estado' && o.method === 'PATCH');
    expect(JSON.parse(call[1].body)).toEqual({ estado: 'entregado' });
    expect(await screen.findByText('0 pedido(s) listo(s) esperando entrega.')).toBeInTheDocument();
  });

  it('cancela un pedido tras confirmar', async () => {
    const f = mockApi({ ...base, 'GET /api/pedidos': [pedido()], 'PATCH /api/pedidos/1/estado': b => pedido({ estado: b.estado }) });
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar pedido' }));
    expect(confirm).toHaveBeenCalledWith('¿Cancelar el pedido #1?');
    const call = f.mock.calls.find(([u, o]) => u === '/api/pedidos/1/estado' && o.method === 'PATCH');
    expect(JSON.parse(call[1].body)).toEqual({ estado: 'cancelado' });
  });

  it('muestra el error del servidor si no puede avanzar', async () => {
    mockApi({ ...base, 'GET /api/pedidos': [pedido()], 'PATCH /api/pedidos/1/estado': { status: 409, body: { error: 'Conflicto de estado' } } });
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Preparar' }));
    expect(await screen.findByText('Conflicto de estado')).toHaveClass('toast');
  });

  it('muestra las etiquetas del cliente, la promoción y los descuentos', async () => {
    mockApi({ ...base, 'GET /api/pedidos': [pedido({ editadoEn: '2026-11-23T20:05:00Z', promocion: { id: 1, nombre: '2x1' }, descuentoPromo: 3000, descuentoPuntos: 1000 }),
      pedido({ id: 2, canceladoPorCliente: true, estado: 'cancelado' })] });
    pagina();
    expect(await screen.findByText('Editado por el cliente')).toBeInTheDocument();
    expect(screen.getByText('Promoción 2x1: -$3.000')).toBeInTheDocument();
    expect(screen.getByText('Puntos: -$1.000')).toBeInTheDocument();
  });

  it('cobra un pedido listo con el método elegido', async () => {
    const f = mockApi({
      ...base,
      'GET /api/public/config': { config, pagos: [{ codigo: 'ef', nombre: 'Efectivo', numero: '', activo: true }], abierto: true, suscripcionActiva: true },
      'GET /api/pedidos': [pedido({ estado: 'listo' })],
      'POST /api/pedidos/1/pago': pedido({ pagoEstado: 'pagado' }),
    });
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar pago' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Efectivo' }));
    const call = f.mock.calls.find(([u, o]) => u === '/api/pedidos/1/pago' && o.method === 'POST');
    expect(JSON.parse(call[1].body)).toEqual({ metodoPago: 'ef' });
  });

  it('el botón de WhatsApp abre el ticket', async () => {
    mockApi({ ...base, 'GET /api/pedidos': [pedido()] });
    const open = vi.fn(); vi.stubGlobal('open', open);
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: /Enviar al WhatsApp/ }));
    expect(open.mock.calls[0][0]).toMatch(/^https:\/\/wa\.me\/573108819617\?text=/);
  });

  it('consulta cada 5 s y suena la campana cuando llega un pedido nuevo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const osc = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), frequency: {} };
    const Audio = vi.fn(function () {
      return { createOscillator: () => osc, createGain: () => ({ connect: vi.fn(), gain: {} }), destination: {}, currentTime: 0 };
    });
    vi.stubGlobal('AudioContext', Audio);
    let lista = [pedido({ id: 1 })];
    const f = mockApi({ ...base, 'GET /api/pedidos': () => lista });
    pagina();
    await screen.findByRole('heading', { name: '#1' });
    expect(Audio).not.toHaveBeenCalled(); // la primera carga no suena
    lista = [pedido({ id: 2 }), pedido({ id: 1 })];
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(await screen.findByText('🔔 Pedido nuevo #2')).toHaveClass('toast');
    expect(osc.start).toHaveBeenCalled();
    expect(f.mock.calls.filter(([u]) => String(u).startsWith('/api/pedidos')).length).toBeGreaterThanOrEqual(2);
  });
});
