import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Ajustes from './Ajustes.jsx';
import Reporte from './Reporte.jsx';
import Facturas from './Facturas.jsx';
import Promociones from './Promociones.jsx';
import Clientes from './Clientes.jsx';
import { mockApi, renderWith } from '../test/helpers.jsx';
import { config, metodos, pedido, platos } from './fixtures.js';
import { SONIDOS, beep } from './sonido.js';
import { configBody, qrCabe } from './ajustes.js';
import { qsFacturas, qsReporte } from './reporte.js';

const csrf = { 'GET /api/auth/csrf': { csrfToken: 't' } };
const llamada = (f, metodo, url) => f.mock.calls.find(([u, o]) => String(u).split('?')[0] === url && (o?.method || 'GET') === metodo);
const cuerpo = (f, metodo, url) => JSON.parse(llamada(f, metodo, url)[1].body);

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.querySelectorAll('.toast:not([role])').forEach(e => e.remove()); });

describe('lógica', () => {
  it('queries de reportes y facturas', () => {
    expect(qsReporte({ desde: '2026-11-01', hasta: '2026-11-07' })).toBe('desde=2026-11-01&hasta=2026-11-07');
    expect(qsReporte({ desde: 'a', hasta: 'b' }, 'solo')).toBe('desde=a&hasta=b&archivados=solo');
    expect(qsFacturas({ q: ' ana ', pagina: 2 }, 'incluir')).toBe('pagina=2&porPagina=20&q=ana&archivados=incluir');
  });
  it('config y límite del QR', () => {
    expect(qrCabe('x'.repeat(700000))).toBe(true);
    expect(qrCabe('x'.repeat(700001))).toBe(false);
    expect(configBody({ ...config, puntosPorMil: '2', puntosCanje: '0', descuentoCanje: '1500' })).toMatchObject({ puntosPorMil: 2, puntosCanje: 1, descuentoCanje: 1500 });
  });
  it('cinco sonidos distintos y cada uno suena', () => {
    expect(SONIDOS.map(s => s.id)).toEqual(['campana', 'timbre', 'pulso', 'arpegio', 'alarma']);
    expect(new Set(SONIDOS.map(s => JSON.stringify([s.onda, s.notas]))).size).toBe(5);
    const osc = vi.fn(() => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn(), frequency: {} }));
    vi.stubGlobal('AudioContext', function () { return { createOscillator: osc, createGain: () => ({ connect: vi.fn(), gain: {} }), destination: {}, currentTime: 0 }; });
    beep('arpegio');
    expect(osc).toHaveBeenCalledTimes(4);
  });
});

describe('Ajustes ola 2', () => {
  const ajustes = (extra = {}) => ({ ...csrf, 'GET /api/config': { ...config, sonido: 'timbre', domiciliosActivos: true, puntosActivos: true, puntosPorMil: 1, puntosCanje: 100, descuentoCanje: 1000 },
    'GET /api/metodos-pago': metodos, 'PUT /api/config': b => b, ...extra });

  it('guarda domicilios, sonido y puntos', async () => {
    const f = mockApi(ajustes());
    renderWith(<Ajustes />);
    const dom = await screen.findByLabelText('Domicilios activos');
    expect(dom).toBeChecked();
    await userEvent.click(dom);
    await userEvent.selectOptions(screen.getByLabelText('Sonido'), 'alarma');
    const ppm = screen.getByLabelText('Puntos por cada $1.000');
    await userEvent.clear(ppm); await userEvent.type(ppm, '3');
    await userEvent.click(screen.getByRole('button', { name: '💾 Guardar cambios' }));
    expect(cuerpo(f, 'PUT', '/api/config')).toMatchObject({ domiciliosActivos: false, sonido: 'alarma', puntosPorMil: 3, puntosCanje: 100, descuentoCanje: 1000 });
  });

  it('el botón Probar toca el sonido elegido', async () => {
    mockApi(ajustes());
    const osc = vi.fn(() => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn(), frequency: {} }));
    vi.stubGlobal('AudioContext', function () { return { createOscillator: osc, createGain: () => ({ connect: vi.fn(), gain: {} }), destination: {}, currentTime: 0 }; });
    renderWith(<Ajustes />);
    await userEvent.click(await screen.findByRole('button', { name: 'Probar alarma'.replace('alarma', 'Alarma') }));
    expect(osc).toHaveBeenCalledTimes(4);
  });

  it('quita el QR de un método de pago', async () => {
    const f = mockApi(ajustes({ 'GET /api/metodos-pago': [metodos[0], { ...metodos[1], qrUrl: 'data:image/png;base64,AA' }], 'PUT /api/metodos-pago/nq': b => b }));
    renderWith(<Ajustes />);
    expect(await screen.findByAltText('QR de Nequi')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar QR' }));
    expect(cuerpo(f, 'PUT', '/api/metodos-pago/nq').qrUrl).toBeNull();
  });

  it('ver eliminados y restaurar un método', async () => {
    const f = mockApi(ajustes({ 'GET /api/metodos-pago': (_b, u) => (u.includes('eliminados=1') ? [{ codigo: 'dv', nombre: 'Daviplata' }] : metodos), 'POST /api/metodos-pago/dv/restaurar': { codigo: 'dv' } }));
    renderWith(<Ajustes />);
    await userEvent.click(await screen.findByLabelText('Ver eliminados'));
    await userEvent.click(await screen.findByRole('button', { name: 'Restaurar' }));
    expect(llamada(f, 'POST', '/api/metodos-pago/dv/restaurar')).toBeTruthy();
  });

  it('reiniciar reportes exige escribir BORRAR y muestra el resultado', async () => {
    const f = mockApi(ajustes({ 'POST /api/admin/reiniciar-reportes': { ok: true, pedidos: 12, compras: 3, bitacora: 40 } }));
    renderWith(<Ajustes />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reiniciar reportes' }));
    const d = within(screen.getByRole('dialog'));
    expect(d.getByText(/No se pierde nada/)).toBeInTheDocument();
    expect(d.getByText(/pedidos en curso no se tocan/)).toBeInTheDocument();
    const ok = d.getByRole('button', { name: 'Reiniciar reportes' });
    expect(ok).toBeDisabled();
    await userEvent.type(d.getByLabelText(/Escribe BORRAR/), 'BORRAR');
    await userEvent.click(ok);
    expect(cuerpo(f, 'POST', '/api/admin/reiniciar-reportes')).toEqual({ confirmar: 'BORRAR' });
    expect(await screen.findByText(/Se archivaron 12 pedido/)).toBeInTheDocument();
  });
});

describe('Reporte ola 2', () => {
  const rep = { total: 0, pedidos: 0, compras: 0, porPlato: [], porMetodo: [], porDia: [] };
  const fact = pedido({ id: 7, cliente: 'Luz', telefono: '3001234567', total: 25000 });
  const rutas = { ...csrf, 'GET /api/reportes/ventas': rep, 'GET /api/pedidos': [], 'GET /api/compras': [], 'GET /api/admin/platos': platos,
    'GET /api/facturas': { total: 1, pagina: 1, porPagina: 20, paginas: 1, facturas: [fact] } };

  it('el filtro de archivados manda archivados a los reportes', async () => {
    const f = mockApi(rutas);
    renderWith(<Reporte />);
    await userEvent.selectOptions(await screen.findByLabelText('Archivados'), 'Solo archivado');
    await vi.waitFor(() => expect(f.mock.calls.some(([u]) => /reportes\/ventas\?.*archivados=solo/.test(u))).toBe(true));
    await userEvent.selectOptions(screen.getByLabelText('Archivados'), 'Todo el histórico');
    await vi.waitFor(() => expect(f.mock.calls.some(([u]) => /pedidos\?.*archivados=incluir/.test(u))).toBe(true));
  });

  it('Facturas: lista, busca y abre el recibo', async () => {
    const f = mockApi(rutas);
    renderWith(<Reporte />);
    await userEvent.click(await screen.findByRole('button', { name: 'Facturas' }));
    expect(await screen.findByText('Luz')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Buscar factura'), 'Luz');
    await vi.waitFor(() => expect(f.mock.calls.some(([u]) => /facturas\?.*q=Luz/.test(u))).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: 'Ver factura' }));
    expect(await screen.findByText('PEDIDO #7')).toBeInTheDocument();
  });

  it('Facturas: pagina', async () => {
    const f = mockApi({ ...rutas, 'GET /api/facturas': { total: 40, pagina: 1, porPagina: 20, paginas: 2, facturas: [fact] } });
    renderWith(<Facturas />);
    await userEvent.click(await screen.findByRole('button', { name: 'Siguiente' }));
    await vi.waitFor(() => expect(f.mock.calls.some(([u]) => /facturas\?pagina=2/.test(u))).toBe(true));
  });
});

describe('Promociones', () => {
  const promo = { id: 1, nombre: 'Martes loco', tipo: 'porcentaje', alcance: 'total', valor: 10, montoMinimo: 30000, inicio: '2026-11-01', fin: '2026-11-30', dias: [1], horaDesde: null, horaHasta: null, activa: true };
  it('crea una promoción por categoría', async () => {
    const f = mockApi({ ...csrf, 'GET /api/promociones': [promo], 'GET /api/admin/platos': platos, 'POST /api/promociones': { status: 201, body: promo } });
    renderWith(<Promociones />);
    expect(await screen.findByText('Martes loco')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '+ Nueva promoción' }));
    const d = within(screen.getByRole('dialog'));
    await userEvent.type(d.getByLabelText('Nombre'), 'Combo');
    await userEvent.selectOptions(d.getByLabelText('Aplica a'), 'categoria');
    await userEvent.selectOptions(d.getByLabelText('Categoría'), platos[0].categoria);
    await userEvent.type(d.getByLabelText('Porcentaje'), '15');
    await userEvent.click(d.getByLabelText('Vie'));
    await userEvent.click(d.getByRole('button', { name: 'Guardar' }));
    expect(cuerpo(f, 'POST', '/api/promociones')).toMatchObject({ nombre: 'Combo', alcance: 'categoria', categoria: platos[0].categoria, valor: 15, dias: [4] });
  });

  it('edita, elimina con confirmación y restaura', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const f = mockApi({ ...csrf, 'GET /api/promociones': (_b, u) => (u.includes('eliminados=1') ? [promo] : [promo]), 'GET /api/admin/platos': platos,
      'PUT /api/promociones/1': promo, 'DELETE /api/promociones/1': { ok: true }, 'POST /api/promociones/1/restaurar': promo });
    renderWith(<Promociones />);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const d = within(screen.getByRole('dialog'));
    expect(d.getByLabelText('Nombre')).toHaveValue('Martes loco');
    await userEvent.click(d.getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => expect(llamada(f, 'PUT', '/api/promociones/1')).toBeTruthy());
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    expect(llamada(f, 'DELETE', '/api/promociones/1')).toBeTruthy();
    await userEvent.click(screen.getByLabelText('Ver eliminadas'));
    await userEvent.click(await screen.findByRole('button', { name: 'Restaurar' }));
    expect(llamada(f, 'POST', '/api/promociones/1/restaurar')).toBeTruthy();
  });
});

describe('Clientes', () => {
  it('busca y muestra los movimientos', async () => {
    const f = mockApi({ ...csrf, 'GET /api/puntos/clientes': [{ celular: '3001112222', nombre: 'Ana', saldo: 250, actualizadoEn: '2026-11-20T10:00:00Z' }],
      'GET /api/puntos/clientes/3001112222/movimientos': { celular: '3001112222', nombre: 'Ana', saldo: 250,
        movimientos: [{ id: 1, pedidoId: 5, tipo: 'ganado', puntos: 30, creadoEn: '2026-11-20T10:00:00Z' }, { id: 2, pedidoId: 6, tipo: 'canjeado', puntos: -100, creadoEn: '2026-11-21T10:00:00Z' }] } });
    renderWith(<Clientes />);
    expect(await screen.findByText('250')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Buscar cliente'), 'ana');
    await vi.waitFor(() => expect(f.mock.calls.some(([u]) => String(u).includes('q=ana'))).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: 'Ver movimientos' }));
    const d = within(await screen.findByRole('dialog'));
    expect(await d.findByText('Canjeado')).toBeInTheDocument();
    expect(d.getByText('+30')).toBeInTheDocument();
    expect(d.getByText('-100')).toBeInTheDocument();
  });
});
