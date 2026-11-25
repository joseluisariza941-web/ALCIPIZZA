import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../test/helpers.jsx';
import CobroModal from './CobroModal.jsx';

const pagos = [{ codigo: 'ef', nombre: 'Efectivo' }, { codigo: 'nq', nombre: 'Nequi' }];
const PUNTOS = { activo: true, porMil: 1, puntosCanje: 100, descuentoCanje: 1000 };
const ped = (o = {}) => ({ id: 8, total: 28000, ...o });
const llamada = (f, metodo, url) => f.mock.calls.find(([u, o]) => u === url && (o?.method || 'GET') === metodo);
const montar = (props = {}, rutas = {}) => {
  const f = mockApi({ 'GET /api/auth/csrf': { csrfToken: 't' }, ...rutas });
  const onCobrado = vi.fn(); const onCerrar = vi.fn();
  render(<CobroModal o={ped()} pagos={pagos} puntos={PUNTOS} onCobrado={onCobrado} onCerrar={onCerrar} {...props} />);
  return { f, onCobrado, onCerrar, u: userEvent.setup() };
};
const modal = () => within(screen.getByRole('dialog'));

describe('CobroModal', () => {
  it('sin puntos activos cobra solo con el método, como antes', async () => {
    const { f, u, onCerrar, onCobrado } = montar({ puntos: { ...PUNTOS, activo: false } }, { 'POST /api/pedidos/8/pago': ped({ pagoEstado: 'pagado' }) });
    expect(modal().queryByLabelText('Celular')).not.toBeInTheDocument();
    await u.click(modal().getByRole('button', { name: 'Nequi' }));
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
    expect(JSON.parse(llamada(f, 'POST', '/api/pedidos/8/pago')[1].body)).toEqual({ metodoPago: 'nq' });
    expect(onCobrado).toHaveBeenCalled();
  });

  it('con puntos activos pero sin celular cobra igual que antes', async () => {
    const { f, u } = montar({}, { 'POST /api/pedidos/8/pago': ped() });
    await u.click(modal().getByRole('button', { name: 'Efectivo' }));
    await waitFor(() => expect(llamada(f, 'POST', '/api/pedidos/8/pago')).toBeTruthy());
    expect(JSON.parse(llamada(f, 'POST', '/api/pedidos/8/pago')[1].body)).toEqual({ metodoPago: 'ef' });
  });

  it('precarga el celular del pedido y manda el celular para acumular', async () => {
    const { f, u } = montar({ o: ped({ celular: '3001234567' }) }, { 'POST /api/pedidos/8/pago': ped() });
    expect(modal().getByLabelText('Celular')).toHaveValue('3001234567');
    await u.click(modal().getByRole('button', { name: 'Efectivo' }));
    await waitFor(() => expect(llamada(f, 'POST', '/api/pedidos/8/pago')).toBeTruthy());
    expect(JSON.parse(llamada(f, 'POST', '/api/pedidos/8/pago')[1].body)).toEqual({ metodoPago: 'ef', celular: '3001234567' });
  });

  it('consulta el saldo, calcula el descuento y envía el canje', async () => {
    const { f, u, onCerrar } = montar({ o: ped({ celular: '3001234567' }) }, {
      'GET /api/public/puntos/3001234567': { celular: '3001234567', activo: true, saldo: 350, puntosCanje: 100, descuentoCanje: 1000 },
      'POST /api/pedidos/8/pago': ped({ pagoEstado: 'pagado', total: 26000, descuentoPuntos: 2000, puntosCanjeados: 200 }),
    });
    await u.click(modal().getByRole('button', { name: 'Ver puntos' }));
    expect(await modal().findByText('Saldo: 350 puntos')).toBeInTheDocument();
    await u.selectOptions(modal().getByLabelText('Canjes a aplicar'), '2');
    expect(modal().getByText('Descuento por puntos: -$2.000')).toBeInTheDocument();
    expect(modal().getByText('Total a cobrar: $26.000')).toBeInTheDocument();
    await u.click(modal().getByRole('button', { name: 'Nequi' }));
    expect(await modal().findByText('Total cobrado: $26.000')).toBeInTheDocument();
    expect(JSON.parse(llamada(f, 'POST', '/api/pedidos/8/pago')[1].body)).toEqual({ metodoPago: 'nq', celular: '3001234567', canjearPuntos: 200 });
    expect(onCerrar).not.toHaveBeenCalled();
    await u.click(modal().getByRole('button', { name: 'Listo' }));
    expect(onCerrar).toHaveBeenCalled();
  });

  it('no deja canjear más que el saldo ni que el total', async () => {
    const { u } = montar({ o: ped({ total: 1500, celular: '3001234567' }) }, {
      'GET /api/public/puntos/3001234567': { celular: '3001234567', activo: true, saldo: 900, puntosCanje: 100, descuentoCanje: 1000 },
    });
    await u.click(modal().getByRole('button', { name: 'Ver puntos' }));
    await modal().findByText('Saldo: 900 puntos');
    const opciones = within(modal().getByLabelText('Canjes a aplicar')).getAllByRole('option').map(x => x.value);
    expect(opciones).toEqual(['0', '1']);
  });

  it('muestra un mensaje claro si el servidor rechaza el canje', async () => {
    const { u, onCerrar } = montar({ o: ped({ celular: '3001234567' }) }, {
      'GET /api/public/puntos/3001234567': { celular: '3001234567', activo: true, saldo: 300, puntosCanje: 100, descuentoCanje: 1000 },
      'POST /api/pedidos/8/pago': { status: 409, body: { error: 'x', code: 'PUNTOS_INSUFICIENTES' } },
    });
    await u.click(modal().getByRole('button', { name: 'Ver puntos' }));
    await modal().findByText('Saldo: 300 puntos');
    await u.selectOptions(modal().getByLabelText('Canjes a aplicar'), '1');
    await u.click(modal().getByRole('button', { name: 'Efectivo' }));
    expect(await modal().findByRole('alert')).toHaveTextContent('El cliente no tiene puntos suficientes');
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it('valida el celular antes de consultar', async () => {
    const { u, f } = montar();
    await u.type(modal().getByLabelText('Celular'), '123');
    await u.click(modal().getByRole('button', { name: 'Ver puntos' }));
    expect(modal().getByRole('alert')).toHaveTextContent('Escribe un celular válido');
    expect(f.mock.calls.some(([x]) => String(x).includes('/puntos/'))).toBe(false);
  });
});
