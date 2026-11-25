import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { mockApi, renderWith } from '../test/helpers.jsx';
import { CONFIG, PEDIDO } from '../cliente/fixtures.js';
import TirillaPage from './TirillaPage.jsx';

function montar(ruta, pedido = PEDIDO, intervalo = 5000) {
  const f = mockApi({ 'GET /api/public/config': CONFIG, 'GET /api/pedidos/7': pedido });
  renderWith(
    <Routes>
      <Route path="/tirilla/:id" element={<TirillaPage intervalo={intervalo} />} />
      <Route path="/" element={<p>inicio</p>} />
    </Routes>, { route: ruta });
  return f;
}
const rc = async () => within(await waitFor(() => { const e = document.querySelector('.md .rc'); if (!e) throw new Error('sin recibo'); return e; }));
const llamadas = f => f.mock.calls.filter(([url]) => String(url).startsWith('/api/pedidos/7'));

afterEach(() => vi.unstubAllGlobals());

describe('TirillaPage', () => {
  it('pide el pedido con el token y muestra la tirilla con el HTML del recibo original', async () => {
    const f = montar('/tirilla/7?token=abc');
    const r = await rc();
    expect(await r.findByText('PEDIDO #7')).toBeInTheDocument();
    expect(llamadas(f)[0][0]).toBe('/api/pedidos/7?token=abc');
    expect(await r.findByRole('heading', { name: 'Pizzería Test' })).toBeInTheDocument();
    expect(r.getByText('Güepsa, Santander · 3001112233')).toBeInTheDocument();
    expect(r.getByText('(Doble carne)')).toBeInTheDocument();
    expect(r.getByText('sin Tomate')).toBeInTheDocument();
    expect(r.getByText('+ Queso extra')).toBeInTheDocument();
    expect(r.getByText('+ Ketchup')).toBeInTheDocument();
    expect(r.getAllByText('$22.000')).toHaveLength(2);
    expect(r.getByText('⏳ Pago pendiente · Nequi')).toBeInTheDocument();
    expect(r.getByText('3009998877')).toBeInTheDocument();
    expect(r.getByText('● Recibido')).toHaveClass('on');
    expect(r.getByText('○ Listo')).not.toHaveClass('on');
    expect(r.getByText('A tu gusto test 💛')).toBeInTheDocument();
  });

  it('marca el pago y no pide transferir cuando ya está pagado', async () => {
    montar('/tirilla/7?token=abc', { ...PEDIDO, pagoEstado: 'pagado' });
    const r = await rc();
    expect(await r.findByText('✅ Pagado con Nequi')).toBeInTheDocument();
    expect(r.queryByText('3009998877')).not.toBeInTheDocument();
  });

  it('sin token en la URL usa el guardado en este navegador', async () => {
    localStorage.setItem('alcipizza.tirilla', JSON.stringify({ id: 7, token: 'guardado' }));
    const f = montar('/tirilla/7');
    await (await rc()).findByText('PEDIDO #7');
    expect(llamadas(f)[0][0]).toBe('/api/pedidos/7?token=guardado');
  });

  it('sin token o con token inválido no muestra la tirilla', async () => {
    montar('/tirilla/7');
    expect(await screen.findByText('Solo puedes ver tu propia tirilla')).toBeInTheDocument();
    mockApi({ 'GET /api/public/config': CONFIG, 'GET /api/pedidos/8': { status: 404, body: { error: 'No encontrado' } } });
    renderWith(<Routes><Route path="/tirilla/:id" element={<TirillaPage />} /></Routes>, { route: '/tirilla/8?token=x' });
    await waitFor(() => expect(screen.getAllByText('Solo puedes ver tu propia tirilla')).toHaveLength(2));
  });

  it('no ofrece el envío por WhatsApp ni la opción de ocultar la tirilla', async () => {
    montar('/tirilla/7?token=abc');
    const r = await rc();
    expect(r.queryByRole('link', { name: /Enviar al WhatsApp/ })).not.toBeInTheDocument();
    expect(r.queryByRole('button', { name: /Ocultar/ })).not.toBeInTheDocument();
    expect(r.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument();
  });

  it('descarga la tirilla en PDF', async () => {
    const crear = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: crear, revokeObjectURL: vi.fn() }));
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    montar('/tirilla/7?token=abc');
    const r = await rc();
    await userEvent.click(await r.findByRole('button', { name: '⬇️ Descargar PDF' }));
    expect(crear).toHaveBeenCalledTimes(1);
    const blob = crear.mock.calls[0][0];
    expect(blob.type).toBe('application/pdf');
    const a = clic.mock.instances[0];
    expect(a.download).toBe('pedido-7.pdf');
    clic.mockRestore();
  });

  it('🖨️ Imprimir llama a print() y Cerrar vuelve al inicio', async () => {
    const pr = vi.fn();
    vi.stubGlobal('print', pr);
    montar('/tirilla/7?token=abc');
    const r = await rc();
    await userEvent.click(await r.findByRole('button', { name: '🖨️ Imprimir' }));
    expect(pr).toHaveBeenCalled();
    await userEvent.click(r.getByRole('button', { name: 'Cerrar' }));
    expect(await screen.findByText('inicio')).toBeInTheDocument();
  });

  it('se actualiza sola hasta que el pedido se entrega', async () => {
    const estados = ['nuevo', 'listo', 'entregado'];
    let n = 0;
    const f = mockApi({
      'GET /api/public/config': CONFIG,
      'GET /api/pedidos/7': () => ({ ...PEDIDO, estado: estados[Math.min(n++, 2)] }),
    });
    renderWith(<Routes><Route path="/tirilla/:id" element={<TirillaPage intervalo={20} />} /></Routes>, { route: '/tirilla/7?token=abc' });
    const r = await rc();
    await waitFor(() => expect(r.getByText('● Entregado')).toHaveClass('on'));
    const hechas = llamadas(f).length;
    expect(hechas).toBe(3);
    await new Promise(res => setTimeout(res, 120));
    expect(llamadas(f).length).toBe(hechas);
  });

  it('muestra cuando el pedido fue cancelado', async () => {
    montar('/tirilla/7?token=abc', { ...PEDIDO, estado: 'cancelado' });
    const r = await rc();
    expect(await r.findByText('❌ Pedido cancelado')).toBeInTheDocument();
  });
});
