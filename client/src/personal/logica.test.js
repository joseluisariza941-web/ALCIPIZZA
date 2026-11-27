import { describe, expect, it } from 'vitest';
import { ApiError } from '../api.js';
import { pesos } from './formato.js';
import { mensajeErrorLogin, validarCambioClave } from './login.js';
import { carritoDesdePedido, cuerpoPedido, itemDesdeSeleccion, opcionesDestino, totalCarrito, validarPedido } from './carrito.js';
import { textoWhatsApp, waLink } from './whatsapp.js';
import { renovarHasta, suscripcionActiva, validarNuevoUsuario } from './usuarios.js';

const PIZZA = {
  id: 1, nombre: 'Pizza', emoji: '🍕', imagenUrl: null, categoria: 'Pizzas',
  variantes: [{ id: 10, nombre: 'Personal', precio: 15000 }, { id: 11, nombre: 'Mediana', precio: 28000 }],
  ingredientes: ['Queso', 'Jamón'], salsas: ['Ketchup', 'Rosada'],
  extras: [{ id: 4, nombre: 'Queso extra', precio: 3000, grupo: null }, { id: 5, nombre: 'Tocineta', precio: 2000, grupo: null }],
};

describe('formato', () => {
  it('pesos colombianos sin decimales', () => {
    expect(pesos(28000)).toBe('$28.000');
    expect(pesos(1500.4)).toBe('$1.500');
  });
});

describe('login', () => {
  const err = (status, code) => new ApiError(status, 'x', code ? { code } : {});
  it('traduce cada error del login a un mensaje para el personal', () => {
    expect(mensajeErrorLogin(err(401))).toBe('Usuario o contraseña incorrectos');
    expect(mensajeErrorLogin(new ApiError(423, 'Error 423', {}))).toMatch(/bloqueada temporalmente/i);
    expect(mensajeErrorLogin(err(423))).toBe('x');
    expect(mensajeErrorLogin(err(429))).toMatch(/demasiados intentos/i);
    expect(mensajeErrorLogin(err(403, 'SUSPENDIDO'))).toMatch(/suscripción.*inactiva/i);
    expect(mensajeErrorLogin(new TypeError('fetch failed'))).toMatch(/sin conexión/i);
  });

  it('valida el cambio de contraseña obligatorio', () => {
    expect(validarCambioClave({ actual: '', nueva: '12345678', confirma: '12345678' })).toMatch(/actual/i);
    expect(validarCambioClave({ actual: 'vieja', nueva: 'corta', confirma: 'corta' })).toMatch(/al menos 8/);
    expect(validarCambioClave({ actual: 'vieja', nueva: '12345678', confirma: '12345679' })).toMatch(/no coinciden/);
    expect(validarCambioClave({ actual: '12345678', nueva: '12345678', confirma: '12345678' })).toMatch(/distinta/);
    expect(validarCambioClave({ actual: 'vieja', nueva: '12345678', confirma: '12345678' })).toBeNull();
  });
});

describe('carrito', () => {
  it('arma un ítem con la variante, extras y precio sumado', () => {
    const it = itemDesdeSeleccion(PIZZA, { varianteId: 11, extras: [4, 5], sin: ['Jamón'], salsas: ['Ketchup'], nota: ' bien asada ' });
    expect(it).toEqual({
      platoId: 1, varianteId: 11, nombre: 'Pizza', emoji: '🍕', variante: 'Mediana', precio: 33000,
      extras: [{ id: 4, nombre: 'Queso extra', precio: 3000 }, { id: 5, nombre: 'Tocineta', precio: 2000 }],
      sin: ['Jamón'], salsas: ['Ketchup'], nota: 'bien asada',
    });
  });

  it('"pedir con todo" no quita nada y lleva todas las salsas del plato', () => {
    const it = itemDesdeSeleccion(PIZZA, { varianteId: 10, extras: [], sin: ['Queso'], salsas: [], nota: '' }, true);
    expect(it.sin).toEqual([]);
    expect(it.salsas).toEqual(['Ketchup', 'Rosada']);
    expect(it.precio).toBe(15000);
  });

  it('suma el total del carrito', () => {
    expect(totalCarrito([{ precio: 1000 }, { precio: 2500 }])).toBe(3500);
  });

  it('opciones de destino de la mesera: mesas y domicilio', () => {
    expect(opcionesDestino(3)).toEqual(['Mesa 1', 'Mesa 2', 'Mesa 3', 'Domicilio']);
  });

  it('valida el pedido de la mesera con los mismos mensajes del original', () => {
    const item = { precio: 1 };
    expect(validarPedido([], { destino: 'Mesa 1' })).toBe('Primero agrega un plato a tu pedido');
    expect(validarPedido([item], { destino: '' })).toBe('Elige la mesa o domicilio');
    expect(validarPedido([item], { destino: 'Domicilio', cliente: ' ', direccion: 'x' })).toBe('Escribe el nombre');
    expect(validarPedido([item], { destino: 'Domicilio', cliente: 'Ana', direccion: '' })).toBe('Escribe la dirección');
    expect(validarPedido([item], { destino: 'Mesa 2' })).toBeNull();
  });

  it('arma el cuerpo del POST sin precios (los calcula el servidor)', () => {
    const it = itemDesdeSeleccion(PIZZA, { varianteId: 11, extras: [4], sin: [], salsas: ['Rosada'], nota: '' });
    expect(cuerpoPedido([it], { destino: 'Mesa 3', cliente: 'no va', direccion: 'no va', telefono: 'no va' })).toEqual({
      destino: 'Mesa 3', mesa: 3,
      items: [{ platoId: 1, varianteId: 11, extras: [4], salsas: ['Rosada'], sin: [], nota: '' }],
    });
    expect(cuerpoPedido([it], { destino: 'Domicilio', cliente: ' Ana ', direccion: 'Cra 1', telefono: '' })).toEqual({
      destino: 'Domicilio', cliente: 'Ana', direccion: 'Cra 1',
      items: [{ platoId: 1, varianteId: 11, extras: [4], salsas: ['Rosada'], sin: [], nota: '' }],
    });
  });

  it('reconstruye el carrito de un pedido para editarlo', () => {
    const pedido = { items: [{ id: 99, platoId: 1, nombre: 'Pizza', emoji: '🍕', variante: 'Mediana', precioUnitario: 31000, nota: 'x',
      extras: [{ id: 4, nombre: 'Queso extra', precio: 3000 }], salsas: ['Ketchup'], sin: ['Queso'] }] };
    expect(carritoDesdePedido(pedido, [PIZZA])).toEqual([{
      platoId: 1, varianteId: 11, nombre: 'Pizza', emoji: '🍕', variante: 'Mediana', precio: 31000,
      extras: [{ id: 4, nombre: 'Queso extra', precio: 3000 }], sin: ['Queso'], salsas: ['Ketchup'], nota: 'x',
    }]);
  });
});

describe('WhatsApp', () => {
  const pedido = {
    id: 7, creadoEn: '2026-11-23T20:30:00.000Z', origen: 'mesera', mesera: { id: 3, nombre: 'Ana' }, destino: 'Domicilio',
    cliente: 'Juan', direccion: 'Cra 1', telefono: '300', total: 33000, estado: 'listo', pagoEstado: 'pendiente', metodoPago: null,
    items: [{ nombre: 'Pizza', variante: 'Mediana', precioUnitario: 33000, nota: 'bien asada', extras: [{ id: 4, nombre: 'Queso extra', precio: 3000 }], salsas: ['Ketchup'], sin: ['Jamón'] }],
  };
  it('arma el texto del ticket igual que el original', () => {
    const t = textoWhatsApp(pedido, { n: 'Alcipizza', tel: '3001112233' }).split('\n');
    expect(t[0]).toBe('*Alcipizza* · Pedido #7');
    expect(t[2]).toBe('Domicilio · Juan · Tel 300 · Cra 1');
    expect(t[4]).toBe('• Pizza (Mediana) $33.000 · sin Jamón · salsas: Ketchup · + Queso extra · "bien asada"');
    expect(t.slice(6)).toEqual(['*TOTAL $33.000*', 'Pago pendiente', 'Mesera: Ana']);
  });
  it('enlace wa.me con el teléfono del local', () => {
    const url = waLink({ ...pedido, pagoEstado: 'pagado', metodoPago: { codigo: 'ef', nombre: 'Efectivo' } }, { n: 'Alcipizza', tel: '3001112233' });
    expect(url.startsWith('https://wa.me/573001112233?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toContain('Pagado con Efectivo');
  });
});

describe('usuarios y suscripción', () => {
  it('valida un acceso nuevo', () => {
    expect(validarNuevoUsuario({ nombre: '', usuario: 'x', clave: '12345678' })).toBe('Datos incompletos o usuario repetido');
    expect(validarNuevoUsuario({ nombre: 'Ana', usuario: 'ana', clave: '123' })).toMatch(/al menos 8/);
    expect(validarNuevoUsuario({ nombre: 'Ana', usuario: 'ana', clave: '12345678' }, ['ANA'.toLowerCase()])).toBe('Datos incompletos o usuario repetido');
    expect(validarNuevoUsuario({ nombre: 'Ana', usuario: 'ana', clave: '12345678' }, ['luz'])).toBeNull();
  });
  it('renovar suma un año desde hoy o desde el vencimiento si es futuro', () => {
    const ahora = Date.parse('2026-01-01T00:00:00Z');
    expect(renovarHasta('2025-06-01T00:00:00.000Z', ahora)).toBe(new Date(ahora + 365 * 864e5).toISOString());
    expect(renovarHasta('2026-03-01T00:00:00.000Z', ahora)).toBe(new Date(Date.parse('2026-03-01T00:00:00Z') + 365 * 864e5).toISOString());
    expect(renovarHasta(null, ahora)).toBe(new Date(ahora + 365 * 864e5).toISOString());
  });
  it('activa solo si está encendida y no ha vencido', () => {
    const ahora = Date.parse('2026-01-01T00:00:00Z');
    expect(suscripcionActiva({ activa: true, hasta: '2026-02-01T00:00:00Z' }, ahora)).toBe(true);
    expect(suscripcionActiva({ activa: true, hasta: '2025-12-01T00:00:00Z' }, ahora)).toBe(false);
    expect(suscripcionActiva({ activa: false, hasta: '2026-02-01T00:00:00Z' }, ahora)).toBe(false);
  });
});
