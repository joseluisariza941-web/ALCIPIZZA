import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { mockApi, renderWith } from '../test/helpers.jsx';
import { CONFIG, MENU, PEDIDO } from '../cliente/fixtures.js';
import { guardarEdicion, leerEdicion } from '../cliente/tirillaLocal.js';
import ClientePage from './ClientePage.jsx';

function Ubicacion() { const l = useLocation(); return <p data-testid="ubicacion">{l.pathname + l.search}</p>; }

function montar(rutas = {}, cfg = {}) {
  const f = mockApi({ 'GET /api/public/config': { ...CONFIG, ...cfg }, 'GET /api/menu': MENU, 'GET /api/auth/csrf': { csrfToken: 't' }, ...rutas });
  renderWith(<Routes><Route path="/" element={<ClientePage />} /><Route path="/tirilla/:id" element={<Ubicacion />} /></Routes>);
  return f;
}
const ticket = () => within(document.querySelector('aside.tk'));
const modal = () => within(document.querySelector('.md'));
const u = () => userEvent.setup();

async function agregarHamburguesa(user, { conTodo = false } = {}) {
  const card = (await screen.findByRole('heading', { name: 'Hamburguesa' })).closest('.card');
  await user.click(within(card).getByRole('button', { name: 'Elegir y personalizar' }));
  await user.click(modal().getByRole('button', { name: conTodo ? 'Pedir con todo' : 'Agregar' }));
}

describe('ClientePage · bienvenida y horarios', () => {
  it('muestra los textos de bienvenida w1..w4 de la configuración', async () => {
    montar();
    expect(await screen.findByRole('heading', { level: 1, name: 'Antojo test' })).toBeInTheDocument();
    expect(screen.getByText('Sabor test', { selector: '.hero p' })).toBeInTheDocument();
    expect(screen.getByText('Menú test')).toHaveClass('st');
    expect(screen.getByText('A tu gusto test')).toHaveClass('st', 'y');
  });

  it('cartel de horarios con los 7 días y estado abierto', async () => {
    montar();
    expect(await screen.findByRole('heading', { name: '🕒 Horarios' })).toBeInTheDocument();
    expect(screen.getByText('● Abierto ahora')).toHaveClass('bd', 'on');
    expect(document.querySelectorAll('.cartel .dr')).toHaveLength(7);
    expect(screen.getByText('Lunes')).toBeInTheDocument();
  });

  it('muestra "Cerrado ahora" cuando el local está cerrado', async () => {
    montar({}, { abierto: false });
    expect(await screen.findByText('● Cerrado ahora')).toHaveClass('bd', 'of');
  });

  it('con la suscripción inactiva muestra "Servicio en pausa" y no el menú', async () => {
    montar({}, { suscripcionActiva: false });
    expect(await screen.findByRole('heading', { name: 'Servicio en pausa' })).toBeInTheDocument();
    expect(screen.getByText(/Escríbenos por WhatsApp al 3001112233/)).toBeInTheDocument();
    expect(screen.queryByText('Elegir y personalizar')).not.toBeInTheDocument();
  });
});

describe('ClientePage · menú y personalización', () => {
  it('lista los platos y filtra por categoría', async () => {
    const user = u();
    montar();
    expect(await screen.findByRole('heading', { name: 'Hamburguesa' })).toBeInTheDocument();
    expect(screen.getByText('desde $14.000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Todo' })).toHaveClass('chip', 'ct', 'on');
    await user.click(screen.getByRole('button', { name: 'Bebidas' }));
    expect(screen.queryByRole('heading', { name: 'Hamburguesa' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Coca-Cola' })).toBeInTheDocument();
  });

  it('personaliza variante, extras excluyentes, quita ingredientes, salsas y nota', async () => {
    const user = u();
    montar();
    const card = (await screen.findByRole('heading', { name: 'Hamburguesa' })).closest('.card');
    await user.click(within(card).getByRole('button', { name: 'Elegir y personalizar' }));
    const m = modal();
    expect(m.getByRole('heading', { name: '🍔 Hamburguesa' })).toBeInTheDocument();
    await user.click(m.getByRole('button', { name: 'Doble carne · $20.000' }));
    await user.click(m.getByRole('button', { name: 'Papas pequeña · +$3.000' }));
    await user.click(m.getByRole('button', { name: 'Papas mediana · +$5.000' }));
    expect(m.getByRole('button', { name: 'Papas pequeña · +$3.000' })).not.toHaveClass('on');
    await user.click(m.getByRole('button', { name: 'Queso extra · +$2.000' }));
    await user.click(m.getByRole('button', { name: 'Tomate' }));
    expect(m.getByRole('button', { name: 'Tomate' })).toHaveClass('chip', 'ig', 'off');
    expect(m.getByRole('button', { name: 'Ketchup' })).toHaveClass('chip', 'sa', 'on');
    await user.click(m.getByRole('button', { name: 'Mayonesa' }));
    await user.type(m.getByPlaceholderText('Nota (ej: bien asada)'), 'bien asada');
    await user.click(m.getByRole('button', { name: 'Agregar' }));

    expect(document.querySelector('.md')).toBeNull();
    const t = ticket();
    expect(t.getByText('(Doble carne)')).toBeInTheDocument();
    expect(t.getByText('sin Tomate')).toBeInTheDocument();
    expect(t.getByText('+ Papas mediana, Queso extra')).toBeInTheDocument();
    expect(t.getByText('salsas: Ketchup')).toBeInTheDocument();
    expect(t.getByText('“bien asada”')).toBeInTheDocument();
    expect(t.getAllByText('$27.000')).toHaveLength(2); // línea y total
  });

  it('las bebidas no ofrecen quitar ingredientes ni "Pedir con todo"', async () => {
    const user = u();
    montar();
    const card = (await screen.findByRole('heading', { name: 'Coca-Cola' })).closest('.card');
    expect(within(card).queryByText('Lleva')).not.toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Elegir y personalizar' }));
    expect(modal().queryByText('Toca lo que quieras quitar (no cuesta nada)')).not.toBeInTheDocument();
    expect(modal().queryByRole('button', { name: 'Pedir con todo' })).not.toBeInTheDocument();
    await user.click(modal().getByRole('button', { name: 'Cerrar' }));
    expect(document.querySelector('.md')).toBeNull();
  });

  it('suma el total y permite quitar platos del pre-ticket', async () => {
    const user = u();
    montar();
    expect(await screen.findByText('Elige un plato del menú para empezar tu pedido.')).toBeInTheDocument();
    await agregarHamburguesa(user);
    await agregarHamburguesa(user, { conTodo: true });
    expect(ticket().getByText('$28.000')).toBeInTheDocument();
    await user.click(ticket().getAllByRole('button', { name: 'Quitar' })[0]);
    expect(ticket().getAllByText('$14.000')).toHaveLength(2);
  });
});

describe('ClientePage · destino, pago y envío', () => {
  it('los campos cambian según el destino', async () => {
    const user = u();
    montar();
    const t = ticket();
    expect(await t.findByLabelText('Dirección')).toBeInTheDocument();
    expect(t.getByLabelText('Teléfono')).toBeInTheDocument();
    await user.selectOptions(t.getByLabelText('Destino'), 'En el local');
    expect(t.queryByLabelText('Dirección')).not.toBeInTheDocument();
    expect(t.queryByLabelText('Teléfono')).not.toBeInTheDocument();
    expect(within(t.getByLabelText('Tu mesa')).getAllByRole('option')).toHaveLength(5); // "Elige tu mesa…" + 4
    await user.selectOptions(t.getByLabelText('Destino'), 'Recoger en local');
    expect(t.getByLabelText('Teléfono')).toBeInTheDocument();
    expect(t.queryByLabelText('Dirección')).not.toBeInTheDocument();
  });

  it('muestra el número para transferir según el método de pago', async () => {
    const user = u();
    montar();
    const t = ticket();
    await user.selectOptions(await t.findByLabelText('¿Cómo pagarás?'), 'Nequi');
    expect(t.getByText('3009998877')).toBeInTheDocument();
    expect(t.getByText('La mesera cobra al entregarte el pedido.')).toBeInTheDocument();
  });

  it('avisa si falta algo antes de confirmar', async () => {
    const user = u();
    montar();
    await user.click(await screen.findByRole('button', { name: 'Enviar pedido' }));
    expect(await screen.findByText('Primero agrega un plato a tu pedido')).toHaveClass('toast');
    await agregarHamburguesa(user);
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    expect(await screen.findByText('Escribe el nombre')).toBeInTheDocument();
    expect(document.querySelector('.md')).toBeNull();
  });

  it('confirma, envía el pedido sin precios, guarda la tirilla y navega a ella', async () => {
    const user = u();
    let cuerpo;
    montar({ 'POST /api/pedidos': b => { cuerpo = b; return { status: 201, body: { pedido: { ...PEDIDO, id: 15 }, token: 'tk/15' } }; } });
    await agregarHamburguesa(user, { conTodo: true });
    const t = ticket();
    await user.selectOptions(t.getByLabelText('Destino'), 'En el local');
    await user.selectOptions(t.getByLabelText('Tu mesa'), 'Mesa 3');
    await user.type(t.getByLabelText('Nombre'), 'Ana');
    await user.click(t.getByRole('button', { name: 'Enviar pedido' }));

    const m = modal();
    expect(m.getByRole('heading', { name: '¿Confirmas el pedido?' })).toBeInTheDocument();
    expect(m.getByText('En el local · Mesa 3 · Ana · Pago: Efectivo')).toBeInTheDocument();
    await user.click(m.getByRole('button', { name: '✅ Confirmar y enviar' }));

    expect(await screen.findByTestId('ubicacion')).toHaveTextContent('/tirilla/15?token=tk%2F15');
    expect(cuerpo).toEqual({
      destino: 'En el local', mesa: 3, cliente: 'Ana', metodoPago: 'ef',
      items: [{ platoId: 2, varianteId: 21, extras: [], salsas: ['Ketchup', 'Mayonesa'], sin: [], nota: '' }],
    });
    expect(JSON.parse(localStorage.getItem('alcipizza.tirilla'))).toEqual({ id: 15, token: 'tk/15' });
  });

  it('"Volver a revisar" cierra la confirmación sin enviar', async () => {
    const user = u();
    const f = montar();
    await agregarHamburguesa(user);
    const t = ticket();
    await user.type(t.getByLabelText('Nombre'), 'Juan');
    await user.type(t.getByLabelText('Dirección'), 'Cra 1');
    await user.type(t.getByLabelText('Teléfono'), '300');
    await user.click(t.getByRole('button', { name: 'Enviar pedido' }));
    await user.click(modal().getByRole('button', { name: 'Volver a revisar' }));
    expect(document.querySelector('.md')).toBeNull();
    expect(f.mock.calls.some(([url, o]) => url === '/api/pedidos' && o?.method === 'POST')).toBe(false);
  });

  it('si la API rechaza el pedido muestra su mensaje y conserva el carrito', async () => {
    const user = u();
    montar({ 'POST /api/pedidos': { status: 403, body: { error: 'El local está cerrado' } } });
    await agregarHamburguesa(user);
    const t = ticket();
    await user.selectOptions(t.getByLabelText('Destino'), 'Recoger en local');
    await user.type(t.getByLabelText('Nombre'), 'Juan');
    await user.type(t.getByLabelText('Teléfono'), '300');
    await user.click(t.getByRole('button', { name: 'Enviar pedido' }));
    await user.click(modal().getByRole('button', { name: '✅ Confirmar y enviar' }));
    expect(await screen.findByText('El local está cerrado')).toHaveClass('toast');
    expect(ticket().getByText('(Sencilla)')).toBeInTheDocument();
    expect(localStorage.getItem('alcipizza.tirilla')).toBeNull();
  });
});

describe('ClientePage · mi pedido en curso', () => {
  it('muestra el estado del último pedido y lleva a su tirilla', async () => {
    const user = u();
    localStorage.setItem('alcipizza.tirilla', JSON.stringify({ id: 7, token: 'abc' }));
    const f = montar({ 'GET /api/pedidos/7': { ...PEDIDO, estado: 'listo' } });
    expect(await screen.findByText('📦 Tu pedido #7: ¡listo!')).toBeInTheDocument();
    expect(f.mock.calls.find(([url]) => String(url).startsWith('/api/pedidos/7'))[0]).toBe('/api/pedidos/7?token=abc');
    await user.click(screen.getByRole('button', { name: 'Ver mi tirilla' }));
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/tirilla/7?token=abc');
  });

  it('ya no ofrece "Ocultar" y conserva el acceso a la tirilla', async () => {
    localStorage.setItem('alcipizza.tirilla', JSON.stringify({ id: 7, token: 'abc' }));
    montar({ 'GET /api/pedidos/7': PEDIDO });
    expect(await screen.findByText('📦 Tu pedido #7: nuevo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ocultar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver mi tirilla' })).toBeInTheDocument();
  });

  it('no muestra pedidos ya entregados', async () => {
    localStorage.setItem('alcipizza.tirilla', JSON.stringify({ id: 7, token: 'abc' }));
    const f = montar({ 'GET /api/pedidos/7': { ...PEDIDO, estado: 'entregado' } });
    await waitFor(() => expect(f.mock.calls.some(([url]) => String(url).startsWith('/api/pedidos/7'))).toBe(true));
    await screen.findByRole('heading', { name: 'Hamburguesa' });
    expect(screen.queryByText(/Tu pedido #7/)).not.toBeInTheDocument();
  });
});

describe('ClientePage · domicilios apagados', () => {
  const apagados = { config: { ...CONFIG.config, domiciliosActivos: false } };

  it('no muestra la opción Domicilio', async () => {
    montar({}, apagados);
    const t = ticket();
    const sel = await t.findByLabelText('Destino');
    expect(within(sel).queryByRole('option', { name: 'Domicilio' })).not.toBeInTheDocument();
    expect(within(sel).getByRole('option', { name: 'Recoger en local' })).toBeInTheDocument();
  });

  it('muestra el mensaje si la API responde DOMICILIOS_APAGADOS', async () => {
    const user = u();
    montar({ 'POST /api/pedidos': { status: 409, body: { error: 'Por ahora no tenemos domicilios', code: 'DOMICILIOS_APAGADOS' } } }, apagados);
    await agregarHamburguesa(user);
    const t = ticket();
    await user.type(t.getByLabelText('Nombre'), 'Juan');
    await user.type(t.getByLabelText('Teléfono'), '3001234567');
    await user.click(t.getByRole('button', { name: 'Enviar pedido' }));
    await user.click(modal().getByRole('button', { name: '✅ Confirmar y enviar' }));
    expect(await screen.findByText('Por ahora no tenemos domicilios')).toHaveClass('toast');
    expect(ticket().getByText('(Sencilla)')).toBeInTheDocument();
  });
});

describe('ClientePage · QR de pago', () => {
  it('muestra el QR del método elegido junto al número', async () => {
    const user = u();
    montar({}, {
      pagos: [
        { codigo: 'ef', nombre: 'Efectivo', numero: '', activo: true, qrUrl: null },
        { codigo: 'nq', nombre: 'Nequi', numero: '3009998877', activo: true, qrUrl: 'data:image/png;base64,AAA' },
      ],
    });
    const t = ticket();
    await user.selectOptions(await t.findByLabelText('¿Cómo pagarás?'), 'nq');
    const img = t.getByRole('img', { name: 'QR de pago Nequi' });
    expect(img).toHaveAttribute('src', 'data:image/png;base64,AAA');
    expect(t.getByText('3009998877')).toBeInTheDocument();
  });
});

describe('ClientePage · promociones', () => {
  it('muestra el precio tachado, el precio con promoción y la etiqueta', async () => {
    const menu = [
      {
        ...MENU[0], promocion: { id: 1, nombre: 'Martes de hamburguesa', etiqueta: '30% de descuento' },
        variantes: [{ ...MENU[0].variantes[0], precioPromo: 12000 }, MENU[0].variantes[1]],
      },
      MENU[1],
    ];
    montar({ 'GET /api/menu': menu });
    const card = (await screen.findByRole('heading', { name: 'Hamburguesa' })).closest('.card');
    expect(within(card).getByText('$12.000')).toBeInTheDocument();
    expect(within(card).getByText('$14.000').tagName).toBe('S');
    expect(within(card).getByText('Martes de hamburguesa')).toBeInTheDocument();
  });

  it('cotiza con debounce y muestra subtotal, descuento de promoción y total del servidor', async () => {
    const user = u();
    const cotizados = [];
    montar({
      'POST /api/pedidos/cotizar': b => {
        cotizados.push(b);
        return { subtotal: 14000, descuentoPromo: 2000, promocion: { id: 1, nombre: 'Martes de hamburguesa' }, puntosCanjeados: 0, descuentoPuntos: 0, total: 12000 };
      },
    });
    await agregarHamburguesa(user);
    await waitFor(() => expect(cotizados).toHaveLength(1));
    expect(cotizados[0].items[0]).toMatchObject({ platoId: 2, varianteId: 21 });
    const t = ticket();
    expect(t.getByText('Subtotal')).toBeInTheDocument();
    expect(t.getByText('Descuento promoción')).toBeInTheDocument();
    expect(t.getByText('$12.000')).toBeInTheDocument();
  });
});

describe('ClientePage · puntos', () => {
  const puntos = { activo: true, porMil: 1, puntosCanje: 100, descuentoCanje: 1000 };

  it('valida el celular, consulta el saldo y lo envía en el pedido', async () => {
    const user = u();
    let cuerpo;
    montar({
      'GET /api/public/puntos/3001234567': { celular: '3001234567', activo: true, saldo: 250, puntosCanje: 100, descuentoCanje: 1000 },
      'POST /api/pedidos': b => { cuerpo = b; return { status: 201, body: { pedido: { ...PEDIDO, id: 15 }, token: 'tk/15' } }; },
    }, { puntos });
    await agregarHamburguesa(user);
    const t = ticket();
    const cel = t.getByLabelText('Celular para acumular puntos');
    await user.type(cel, '123');
    await user.type(t.getByLabelText('Nombre'), 'Juan');
    await user.type(t.getByLabelText('Dirección'), 'Cra 1');
    await user.type(t.getByLabelText('Teléfono'), '3001234567');
    await user.click(t.getByRole('button', { name: 'Enviar pedido' }));
    expect(await screen.findByText('Escribe un celular válido (10 dígitos que empiezan por 3)')).toHaveClass('toast');
    expect(document.querySelector('.md')).toBeNull();

    await user.clear(cel);
    await user.type(cel, '3001234567');
    await user.click(t.getByRole('button', { name: 'Consultar mis puntos' }));
    expect(await screen.findByText(/Tienes 250 puntos/)).toBeInTheDocument();
    expect(screen.getByText(/Canjéalos al pagar en caja: cada 100 puntos = \$1\.000 de descuento/)).toBeInTheDocument();

    await user.click(t.getByRole('button', { name: 'Enviar pedido' }));
    await user.click(modal().getByRole('button', { name: '✅ Confirmar y enviar' }));
    expect(await screen.findByTestId('ubicacion')).toHaveTextContent('/tirilla/15?token=tk%2F15');
    expect(cuerpo.celular).toBe('3001234567');
    expect(cuerpo).not.toHaveProperty('canjearPuntos');
  });

  it('muestra el campo opcional pero no la consulta si el programa está inactivo', async () => {
    montar();
    const t = ticket();
    expect(await t.findByLabelText('Destino')).toBeInTheDocument();
    expect(t.getByLabelText('Celular para acumular puntos')).toBeInTheDocument();
    expect(t.queryByRole('button', { name: 'Consultar mis puntos' })).not.toBeInTheDocument();
  });
});

describe('ClientePage · editar pedido', () => {
  it('carga los ítems y el formulario y reenvía con PUT conservando el token', async () => {
    const user = u();
    let cuerpo;
    let intentoPost = false;
    guardarEdicion({ id: 7, token: 'abc', pedido: PEDIDO });
    montar({
      'PUT /api/pedidos/7/cliente': b => { cuerpo = b; return { ...PEDIDO, editadoEn: '2026-11-24T10:00:00' }; },
      'POST /api/pedidos': () => { intentoPost = true; return { status: 201, body: { pedido: PEDIDO, token: 'x' } }; },
    });
    const t = ticket();
    expect(await t.findByText('(Doble carne)')).toBeInTheDocument();
    expect(t.getByLabelText('Nombre')).toHaveValue('Juan');

    await user.click(t.getByRole('button', { name: 'Enviar pedido' }));
    await user.click(modal().getByRole('button', { name: '✅ Confirmar y enviar' }));

    expect(await screen.findByTestId('ubicacion')).toHaveTextContent('/tirilla/7?token=abc');
    expect(cuerpo).toEqual({
      token: 'abc', destino: 'Domicilio', cliente: 'Juan', direccion: 'Cra 1 #2-3', telefono: '3001234567', metodoPago: 'nq',
      items: [{ platoId: 2, varianteId: 22, extras: [4], salsas: ['Ketchup'], sin: ['Tomate'], nota: '' }],
    });
    expect(intentoPost).toBe(false);
    expect(leerEdicion()).toBeNull();
    expect(JSON.parse(localStorage.getItem('alcipizza.tirilla'))).toEqual({ id: 7, token: 'abc' });
  });

  it('si responde 409 NO_EDITABLE avisa y lleva al estado actual de la tirilla', async () => {
    const user = u();
    guardarEdicion({ id: 7, token: 'abc', pedido: PEDIDO });
    montar({ 'PUT /api/pedidos/7/cliente': { status: 409, body: { error: 'Tu pedido ya está en cocina', code: 'NO_EDITABLE' } } });
    const t = ticket();
    await t.findByText('(Doble carne)');
    await user.click(t.getByRole('button', { name: 'Enviar pedido' }));
    await user.click(modal().getByRole('button', { name: '✅ Confirmar y enviar' }));
    expect(await screen.findByText('Tu pedido ya está en cocina')).toHaveClass('toast');
    expect(await screen.findByTestId('ubicacion')).toHaveTextContent('/tirilla/7?token=abc');
  });
});
