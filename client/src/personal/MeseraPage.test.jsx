import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import MeseraPage from '../pages/MeseraPage.jsx';
import { mockApi, renderWith } from '../test/helpers.jsx';

const ANA = { id: 3, usuario: 'ana', nombre: 'Ana', rol: 'mesera', activo: true, debeCambiarClave: false };

const PIZZA = {
  id: 1, nombre: 'Pizza', emoji: '🍕', imagenUrl: null, categoria: 'Pizzas',
  variantes: [{ id: 10, nombre: 'Personal', precio: 15000 }, { id: 11, nombre: 'Mediana', precio: 28000 }],
  ingredientes: ['Queso', 'Jamón'], salsas: ['Ketchup', 'Rosada'],
  extras: [
    { id: 4, nombre: 'Queso extra', precio: 3000, grupo: null },
    { id: 5, nombre: 'Borde de queso', precio: 4000, grupo: 'borde' },
    { id: 6, nombre: 'Borde de bocadillo', precio: 5000, grupo: 'borde' },
  ],
};
const GASEOSA = { id: 2, nombre: 'Gaseosa', emoji: '🥤', imagenUrl: null, categoria: 'Bebidas',
  variantes: [{ id: 20, nombre: '400 ml', precio: 3000 }], ingredientes: [], salsas: [], extras: [] };

const CONFIG = {
  config: { n: 'Alcipizza', w1: 'Hola', w2: 'Sabor que enamora', w3: '', w4: 'Gracias por tu compra', tel: '3001112233', mesas: 4, h: [], logo: null, bg: null },
  pagos: [{ codigo: 'ef', nombre: 'Efectivo', numero: '', activo: true }, { codigo: 'nq', nombre: 'Nequi', numero: '3009998877', activo: true }],
  abierto: true, suscripcionActiva: true,
};

const item = { id: 50, platoId: 1, nombre: 'Pizza', emoji: '🍕', variante: 'Mediana', precioUnitario: 28000, nota: '', extras: [], salsas: ['Ketchup'], sin: [] };
const pedido = (id, o = {}) => ({
  id, creadoEn: '2026-11-23T20:00:00.000Z', origen: 'mesera', mesera: { id: 3, nombre: 'Ana' }, destino: 'Mesa 2', cliente: '', direccion: '', telefono: '',
  total: 28000, estado: 'nuevo', pagoEstado: 'pendiente', metodoPago: null, pagadoEn: null, cobradoPor: null, items: [item], ...o,
});

function montar(rutasExtra = {}, pedidos = []) {
  const f = mockApi({
    'GET /api/menu': [PIZZA, GASEOSA],
    'GET /api/public/config': CONFIG,
    'GET /api/pedidos': () => pedidos,
    'GET /api/auth/csrf': { csrfToken: 't' },
    ...rutasExtra,
  });
  const r = renderWith(
    <Routes>
      <Route path="/mesera/*" element={<MeseraPage />} />
      <Route path="/" element={<div>inicio</div>} />
    </Routes>,
    { route: '/mesera', user: ANA },
  );
  return { f, ...r, u: userEvent.setup() };
}

const llamada = (f, metodo, url) => f.mock.calls.find(([u, o]) => u === url && (o?.method || 'GET') === metodo);
const ticket = () => within(screen.getByRole('complementary'));
const modal = () => within(screen.getByRole('dialog'));

describe('MeseraPage · nuevo pedido', () => {
  it('muestra el menú por categorías, el nombre de la mesera y el pre-ticket vacío', async () => {
    const { u } = montar();
    expect(await screen.findByRole('heading', { name: 'Pizza' })).toBeInTheDocument();
    expect(screen.getByText('Ana')).toHaveClass('bd');
    expect(screen.getByRole('button', { name: 'Nuevo pedido' })).toHaveClass('y');
    expect(ticket().getByText('PRE-TICKET')).toBeInTheDocument();
    expect(ticket().getByText('Elige un plato del menú para empezar tu pedido.')).toBeInTheDocument();
    expect(screen.getByText('desde $15.000')).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Bebidas' }));
    expect(screen.queryByRole('heading', { name: 'Pizza' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Gaseosa' })).toBeInTheDocument();
  });

  it('personaliza un plato (variante, extras excluyentes, quitar, salsas, nota) y lo agrega al pre-ticket', async () => {
    const { u } = montar();
    await u.click((await screen.findAllByRole('button', { name: 'Elegir y personalizar' }))[0]);
    const m = modal();
    expect(m.getByRole('heading', { name: '🍕 Pizza' })).toBeInTheDocument();
    await u.click(m.getByRole('button', { name: 'Mediana · $28.000' }));
    await u.click(m.getByRole('button', { name: 'Borde de queso · +$4.000' }));
    await u.click(m.getByRole('button', { name: 'Borde de bocadillo · +$5.000' }));
    expect(m.getByRole('button', { name: 'Borde de queso · +$4.000' })).not.toHaveClass('on');
    expect(m.getByRole('button', { name: 'Borde de bocadillo · +$5.000' })).toHaveClass('on');
    await u.click(m.getByRole('button', { name: 'Jamón' }));
    expect(m.getByRole('button', { name: 'Jamón' })).toHaveClass('off');
    expect(m.getByRole('button', { name: 'Ketchup' })).toHaveClass('on');
    await u.click(m.getByRole('button', { name: 'Rosada' }));
    await u.type(m.getByPlaceholderText('Nota (ej: bien asada)'), 'bien asada');
    await u.click(m.getByRole('button', { name: 'Agregar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const t = ticket();
    expect(t.getByText('(Mediana)')).toBeInTheDocument();
    expect(t.getByText('sin Jamón')).toBeInTheDocument();
    expect(t.getByText('+ Borde de bocadillo')).toBeInTheDocument();
    expect(t.getByText('salsas: Ketchup')).toBeInTheDocument();
    expect(t.getByText('“bien asada”')).toBeInTheDocument();
    expect(t.getAllByText('$33.000')).toHaveLength(2); // línea y total
  });

  it('las bebidas no muestran ingredientes ni "Pedir con todo"; quitar un ítem del pre-ticket', async () => {
    const { u } = montar();
    await u.click(await screen.findByRole('button', { name: 'Bebidas' }));
    await u.click(screen.getByRole('button', { name: 'Elegir y personalizar' }));
    expect(modal().queryByText(/Toca lo que quieras quitar/)).not.toBeInTheDocument();
    expect(modal().queryByRole('button', { name: 'Pedir con todo' })).not.toBeInTheDocument();
    await u.click(modal().getByRole('button', { name: 'Agregar' }));
    expect(ticket().getAllByText('$3.000')).toHaveLength(2);
    await u.click(ticket().getByRole('button', { name: 'Quitar' }));
    expect(ticket().getByText('Elige un plato del menú para empezar tu pedido.')).toBeInTheDocument();
  });

  it('valida, confirma y envía el pedido a la mesa; luego muestra la tirilla', async () => {
    const { u, f } = montar({ 'POST /api/pedidos': { status: 201, body: { pedido: pedido(9, { destino: 'Mesa 2' }) } } });
    await u.click(ticket().getByRole('button', { name: 'Enviar pedido' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Primero agrega un plato a tu pedido');

    await u.click((await screen.findAllByRole('button', { name: 'Elegir y personalizar' }))[0]);
    await u.click(modal().getByRole('button', { name: 'Pedir con todo' }));
    await u.click(ticket().getByRole('button', { name: 'Enviar pedido' }));
    expect(screen.getByRole('status')).toHaveTextContent('Elige la mesa o domicilio');

    expect(ticket().getByLabelText('Destino')).toHaveDisplayValue('Elige la mesa o domicilio…');
    expect(ticket().queryByLabelText('Nombre')).not.toBeInTheDocument();
    await u.selectOptions(ticket().getByLabelText('Destino'), 'Mesa 2');
    await u.click(ticket().getByRole('button', { name: 'Enviar pedido' }));

    expect(modal().getByRole('heading', { name: '¿Confirmas el pedido?' })).toBeInTheDocument();
    expect(modal().getByText('Mesa 2')).toBeInTheDocument();
    await u.click(modal().getByRole('button', { name: '✅ Confirmar y enviar' }));

    expect(await screen.findByText('PEDIDO #9')).toBeInTheDocument();
    const [, opts] = llamada(f, 'POST', '/api/pedidos');
    expect(JSON.parse(opts.body)).toEqual({ destino: 'Mesa 2', mesa: 2,
      items: [{ platoId: 1, varianteId: 10, extras: [], salsas: ['Ketchup', 'Rosada'], sin: [], nota: '' }] });
    expect(ticket().getByText('Elige un plato del menú para empezar tu pedido.')).toBeInTheDocument();
  });

  it('a domicilio pide nombre y dirección', async () => {
    const { u, f } = montar({ 'POST /api/pedidos': { status: 201, body: { pedido: pedido(9, { destino: 'Domicilio' }) } } });
    await u.click((await screen.findAllByRole('button', { name: 'Elegir y personalizar' }))[0]);
    await u.click(modal().getByRole('button', { name: 'Agregar' }));
    await u.selectOptions(ticket().getByLabelText('Destino'), 'Domicilio');
    await u.click(ticket().getByRole('button', { name: 'Enviar pedido' }));
    expect(screen.getByRole('status')).toHaveTextContent('Escribe el nombre');
    await u.type(ticket().getByLabelText('Nombre'), 'Juan');
    await u.click(ticket().getByRole('button', { name: 'Enviar pedido' }));
    expect(screen.getByRole('status')).toHaveTextContent('Escribe la dirección');
    await u.type(ticket().getByLabelText('Dirección'), 'Cra 1 #2-3');
    await u.type(ticket().getByLabelText('Teléfono (opcional)'), '3001234567');
    await u.click(ticket().getByRole('button', { name: 'Enviar pedido' }));
    await u.click(modal().getByRole('button', { name: '✅ Confirmar y enviar' }));
    await screen.findByText('PEDIDO #9');
    expect(JSON.parse(llamada(f, 'POST', '/api/pedidos')[1].body)).toMatchObject({ destino: 'Domicilio', cliente: 'Juan', direccion: 'Cra 1 #2-3', telefono: '3001234567' });
  });

  it('muestra el error del servidor al enviar (p. ej. local cerrado)', async () => {
    const { u } = montar({ 'POST /api/pedidos': { status: 403, body: { error: 'El local está cerrado' } } });
    await u.click((await screen.findAllByRole('button', { name: 'Elegir y personalizar' }))[0]);
    await u.click(modal().getByRole('button', { name: 'Agregar' }));
    await u.selectOptions(ticket().getByLabelText('Destino'), 'Mesa 1');
    await u.click(ticket().getByRole('button', { name: 'Enviar pedido' }));
    await u.click(modal().getByRole('button', { name: '✅ Confirmar y enviar' }));
    expect(await screen.findByRole('status')).toHaveTextContent('El local está cerrado');
    expect(ticket().getByText('(Personal)')).toBeInTheDocument(); // el carrito se conserva
  });
});

describe('MeseraPage · puntos', () => {
  const CON_PUNTOS = { ...CONFIG, puntos: { activo: true, porMil: 1, puntosCanje: 100, descuentoCanje: 1000 } };

  it('envía el celular del cliente al crear el pedido', async () => {
    const { u, f } = montar({ 'POST /api/pedidos': { status: 201, body: { pedido: pedido(9) } } });
    await u.click((await screen.findAllByRole('button', { name: 'Elegir y personalizar' }))[0]);
    await u.click(modal().getByRole('button', { name: 'Agregar' }));
    await u.selectOptions(ticket().getByLabelText('Destino'), 'Mesa 1');
    await u.type(ticket().getByLabelText('Celular del cliente (opcional)'), '300 123 4567');
    await u.click(ticket().getByRole('button', { name: 'Enviar pedido' }));
    await u.click(modal().getByRole('button', { name: '✅ Confirmar y enviar' }));
    await screen.findByText('PEDIDO #9');
    expect(JSON.parse(llamada(f, 'POST', '/api/pedidos')[1].body).celular).toBe('3001234567');
  });

  it('rechaza un celular inválido', async () => {
    const { u } = montar();
    await u.click((await screen.findAllByRole('button', { name: 'Elegir y personalizar' }))[0]);
    await u.click(modal().getByRole('button', { name: 'Agregar' }));
    await u.selectOptions(ticket().getByLabelText('Destino'), 'Mesa 1');
    await u.type(ticket().getByLabelText('Celular del cliente (opcional)'), '123');
    await u.click(ticket().getByRole('button', { name: 'Enviar pedido' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Escribe un celular válido');
  });

  it('cobra canjeando puntos y muestra el total final del servidor', async () => {
    const { u, f } = montar({
      'GET /api/public/config': CON_PUNTOS,
      'GET /api/public/puntos/3001234567': { celular: '3001234567', activo: true, saldo: 500, puntosCanje: 100, descuentoCanje: 1000 },
      'POST /api/pedidos/6/pago': pedido(6, { pagoEstado: 'pagado', total: 27000, descuentoPuntos: 1000 }),
    }, [pedido(6, { estado: 'entregado', celular: '3001234567' })]);
    await u.click(await screen.findByRole('button', { name: 'Historial' }));
    await u.click(screen.getByRole('button', { name: 'Confirmar pago' }));
    await u.click(modal().getByRole('button', { name: 'Ver puntos' }));
    await modal().findByText('Saldo: 500 puntos');
    await u.selectOptions(modal().getByLabelText('Canjes a aplicar'), '1');
    await u.click(modal().getByRole('button', { name: 'Nequi' }));
    expect(await modal().findByText('Total cobrado: $27.000')).toBeInTheDocument();
    expect(JSON.parse(llamada(f, 'POST', '/api/pedidos/6/pago')[1].body)).toEqual({ metodoPago: 'nq', celular: '3001234567', canjearPuntos: 100 });
  });

  it('muestra las etiquetas del cliente y los descuentos en la tarjeta', async () => {
    const { u } = montar({}, [pedido(6, { estado: 'nuevo', origen: 'web', mesera: null, editadoEn: '2026-11-23T20:05:00Z', promocion: { id: 1, nombre: '2x1' }, descuentoPromo: 3000, descuentoPuntos: 1000 }),
      pedido(7, { origen: 'web', mesera: null, estado: 'cancelado', canceladoPorCliente: true })]);
    await u.click(await screen.findByRole('button', { name: 'Historial' }));
    expect(screen.getByText('Editado por el cliente')).toBeInTheDocument();
    expect(screen.getByText('Cancelado por el cliente')).toBeInTheDocument();
    expect(screen.getByText('Promoción 2x1: -$3.000')).toBeInTheDocument();
    expect(screen.getByText('Puntos: -$1.000')).toBeInTheDocument();
  });
});

describe('MeseraPage · historial', () => {
  const lista = [
    pedido(8, { estado: 'listo' }),
    pedido(7, { origen: 'web', mesera: null, destino: 'Domicilio', cliente: 'Luis', telefono: '311', estado: 'preparando', metodoPago: { codigo: 'nq', nombre: 'Nequi' } }),
    pedido(6, { estado: 'entregado', pagoEstado: 'pagado', metodoPago: { codigo: 'ef', nombre: 'Efectivo' } }),
    pedido(5, { estado: 'nuevo' }),
  ];

  it('lista compras web y mis pedidos con el aviso de listos', async () => {
    const { u, f } = montar({}, lista);
    await waitFor(() => expect(llamada(f, 'GET', '/api/pedidos')).toBeTruthy());
    expect(await screen.findByRole('button', { name: 'Historial 🔔1' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Historial 🔔1' }));
    expect(screen.getByRole('heading', { name: '✅ #8 listo para Mesa 2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Compras web' })).toBeInTheDocument();
    expect(screen.getByText('🌐 Compra web')).toBeInTheDocument();
    expect(screen.getByText('Estado: preparando · pagará: Nequi', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('En cocina…')).toBeInTheDocument();
    expect(screen.getByText('Pagado ✓ Efectivo')).toBeInTheDocument();
    expect(screen.getByText('En deuda')).toBeInTheDocument();
  });

  it('marca entregado y cobra con los métodos de pago activos', async () => {
    const { u, f } = montar({
      'PATCH /api/pedidos/8/estado': pedido(8, { estado: 'entregado' }),
      'POST /api/pedidos/6/pago': pedido(6, { pagoEstado: 'pagado' }),
      'POST /api/pedidos/8/pago': pedido(8, { pagoEstado: 'pagado' }),
    }, lista);
    await u.click(await screen.findByRole('button', { name: 'Historial 🔔1' }));
    await u.click(screen.getByRole('button', { name: 'Ya lo entregué' }));
    await waitFor(() => expect(llamada(f, 'PATCH', '/api/pedidos/8/estado')).toBeTruthy());
    expect(JSON.parse(llamada(f, 'PATCH', '/api/pedidos/8/estado')[1].body)).toEqual({ estado: 'entregado' });

    await u.click(screen.getByRole('button', { name: 'Confirmar pago' }));
    expect(modal().getByRole('heading', { name: 'Pedido #8' })).toBeInTheDocument();
    expect(modal().getByText('Total $28.000 · ¿Cómo pagó?')).toBeInTheDocument();
    await u.click(modal().getByRole('button', { name: 'Nequi' }));
    await waitFor(() => expect(llamada(f, 'POST', '/api/pedidos/8/pago')).toBeTruthy());
    expect(JSON.parse(llamada(f, 'POST', '/api/pedidos/8/pago')[1].body)).toEqual({ metodoPago: 'nq' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('edita un pedido nuevo y guarda con PUT', async () => {
    const { u, f } = montar({ 'PUT /api/pedidos/5': pedido(5) }, lista);
    await u.click(await screen.findByRole('button', { name: 'Historial 🔔1' }));
    await u.click(screen.getByRole('button', { name: 'Editar' }));
    expect(ticket().getByText('Editando #5')).toBeInTheDocument();
    expect(ticket().getByLabelText('Destino')).toHaveDisplayValue('Mesa 2');
    expect(ticket().getByText('(Mediana)')).toBeInTheDocument();
    await u.click(ticket().getByRole('button', { name: 'Guardar cambios' }));
    await u.click(modal().getByRole('button', { name: '✅ Confirmar y enviar' }));
    await waitFor(() => expect(llamada(f, 'PUT', '/api/pedidos/5')).toBeTruthy());
    expect(JSON.parse(llamada(f, 'PUT', '/api/pedidos/5')[1].body)).toEqual({ destino: 'Mesa 2', mesa: 2,
      items: [{ platoId: 1, varianteId: 11, extras: [], salsas: ['Ketchup'], sin: [], nota: '' }] });
    expect(await screen.findByText('PRE-TICKET')).toBeInTheDocument();
  });

  it('si cocina ya lo tomó (409) avisa que no se puede editar', async () => {
    const { u } = montar({ 'PUT /api/pedidos/5': { status: 409, body: { error: 'conflicto' } } }, lista);
    await u.click(await screen.findByRole('button', { name: 'Historial 🔔1' }));
    await u.click(screen.getByRole('button', { name: 'Editar' }));
    await u.click(ticket().getByRole('button', { name: 'Guardar cambios' }));
    await u.click(modal().getByRole('button', { name: '✅ Confirmar y enviar' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Este pedido ya no se puede editar');
  });

  it('cancelar la edición vacía el pre-ticket', async () => {
    const { u } = montar({}, lista);
    await u.click(await screen.findByRole('button', { name: 'Historial 🔔1' }));
    await u.click(screen.getByRole('button', { name: 'Editar' }));
    await u.click(ticket().getByRole('button', { name: 'Cancelar edición' }));
    expect(ticket().getByText('PRE-TICKET')).toBeInTheDocument();
  });

  it('la tirilla permite enviar el ticket por WhatsApp', async () => {
    const { u } = montar({}, lista);
    await u.click(await screen.findByRole('button', { name: 'Historial 🔔1' }));
    await u.click(screen.getAllByRole('button', { name: 'Tirilla' })[0]);
    expect(modal().getByText('PEDIDO #7')).toBeInTheDocument();
    const wa = modal().getByRole('link', { name: /Enviar al WhatsApp/ });
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/573001112233\?text=/);
    expect(decodeURIComponent(wa.getAttribute('href'))).toContain('Pedido #7');
    await u.click(modal().getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('MeseraPage · sesión', () => {
  it('Salir (en el encabezado del Shell) cierra la sesión y vuelve al inicio', async () => {
    const { u, auth } = montar();
    auth.logout.mockResolvedValue(undefined);
    await u.click(screen.getByRole('button', { name: 'Salir' }));
    expect(auth.logout).toHaveBeenCalled();
    expect(await screen.findByText('inicio')).toBeInTheDocument();
  });
});

describe('MeseraPage · cambio de clave pendiente', () => {
  it('redirige al acceso del personal', async () => {
    mockApi({});
    renderWith(<Routes><Route path="/mesera/*" element={<MeseraPage />} /><Route path="/personal" element={<div>login</div>} /></Routes>,
      { route: '/mesera', user: { ...ANA, debeCambiarClave: true } });
    expect(await screen.findByText('login')).toBeInTheDocument();
  });
});
