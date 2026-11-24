import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { abrirLocal, agente, db, entrarComo, instantanea, send, testApp } from './helpers.js';

const app = testApp();
let restaurar, cliente, admin, ana, menu;
const plato = n => menu.find(p => p.nombre === n);
const variante = (p, n) => plato(p).variantes.find(v => v.nombre === n).id;
const extra = (p, n) => plato(p).extras.find(e => e.nombre === n).id;
const stock = async n => Number((await db('insumos').where({ nombre: n }).first()).stock);

beforeAll(async () => {
  restaurar = await instantanea();
  await abrirLocal();
  menu = (await request(app).get('/api/menu')).body;
  admin = await entrarComo(app, 'admin');
  ana = await entrarComo(app, 'ana');
});
afterAll(async () => { await restaurar(); await db.destroy(); });
beforeEach(async () => { cliente = await agente(app); });

const burger = (o = {}) => ({
  platoId: plato('Hamburguesa').id, varianteId: variante('Hamburguesa', 'Doble carne'),
  extras: [extra('Hamburguesa', 'Papas mediana'), extra('Hamburguesa', 'Queso extra')],
  salsas: ['Ketchup'], sin: ['Tomate'], nota: 'bien asada', ...o,
});
const pedidoWeb = (o = {}) => ({
  destino: 'Domicilio', cliente: 'Juan', direccion: 'Cra 1 #2-3', telefono: '3001234567', metodoPago: 'nq',
  items: [burger()], ...o,
});

describe('Fase 2 · crear pedido web', () => {
  it('recalcula el precio en el servidor y devuelve el pedido con su token', async () => {
    const res = await send(cliente, 'post', '/api/pedidos', {
      ...pedidoWeb(), total: 1, items: [{ ...burger(), precioUnitario: 1 }],
    }).expect(201);
    const { pedido, token } = res.body;
    expect(pedido.total).toBe(20000 + 5000 + 2000);
    expect(pedido).toMatchObject({
      origen: 'web', mesera: null, destino: 'Domicilio', cliente: 'Juan', direccion: 'Cra 1 #2-3',
      telefono: '3001234567', estado: 'nuevo', pagoEstado: 'pendiente',
      metodoPago: { codigo: 'nq', nombre: 'Nequi' }, pagadoEn: null, cobradoPor: null,
    });
    expect(new Date(pedido.creadoEn).getTime()).toBeGreaterThan(Date.now() - 60e3);
    expect(pedido.items).toEqual([{
      id: expect.any(Number), platoId: plato('Hamburguesa').id, nombre: 'Hamburguesa', emoji: '🍔',
      variante: 'Doble carne', varianteId: variante('Hamburguesa', 'Doble carne'), precioUnitario: 27000, nota: 'bien asada',
      extras: [
        { id: extra('Hamburguesa', 'Papas mediana'), nombre: 'Papas mediana', precio: 5000 },
        { id: extra('Hamburguesa', 'Queso extra'), nombre: 'Queso extra', precio: 2000 },
      ],
      salsas: ['Ketchup'], sin: ['Tomate'],
    }]);
    expect(token).toMatch(/^[\w-]{24,}$/);
    const fila = await db('pedidos').where({ id: pedido.id }).first();
    expect(fila.token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    const log = await db('bitacora').where({ usuario: 'cliente' }).orderBy('id', 'desc').first();
    expect(log.accion).toContain(`#${pedido.id}`);
  });

  it('la tirilla solo se ve con el token correcto', async () => {
    const { pedido, token } = (await send(cliente, 'post', '/api/pedidos', pedidoWeb()).expect(201)).body;
    const res = await request(app).get(`/api/pedidos/${pedido.id}?token=${token}`).expect(200);
    expect(res.body.id).toBe(pedido.id);
    expect(res.body.items).toHaveLength(1);
    await request(app).get(`/api/pedidos/${pedido.id}?token=${'a'.repeat(token.length)}`).expect(404);
    await request(app).get(`/api/pedidos/${pedido.id}`).expect(404);
  });

  it('"En el local" exige mesa válida y se guarda como "En el local · Mesa N"', async () => {
    await send(cliente, 'post', '/api/pedidos', pedidoWeb({ destino: 'En el local', direccion: undefined, telefono: undefined })).expect(400);
    await send(cliente, 'post', '/api/pedidos', pedidoWeb({ destino: 'En el local', mesa: 99 })).expect(400);
    const res = await send(cliente, 'post', '/api/pedidos', pedidoWeb({ destino: 'En el local', mesa: 3 })).expect(201);
    expect(res.body.pedido.destino).toBe('En el local · Mesa 3');
    expect(res.body.pedido.direccion).toBeNull();
    expect(res.body.pedido.telefono).toBeNull();
  });

  it('Domicilio exige dirección y teléfono; Recoger exige teléfono', async () => {
    await send(cliente, 'post', '/api/pedidos', pedidoWeb({ direccion: '' })).expect(400);
    await send(cliente, 'post', '/api/pedidos', pedidoWeb({ telefono: undefined })).expect(400);
    await send(cliente, 'post', '/api/pedidos', pedidoWeb({ destino: 'Recoger en local', telefono: '' })).expect(400);
    const res = await send(cliente, 'post', '/api/pedidos', pedidoWeb({ destino: 'Recoger en local' })).expect(201);
    expect(res.body.pedido.direccion).toBeNull();
    await send(cliente, 'post', '/api/pedidos', pedidoWeb({ destino: 'Mesa 3' })).expect(400);
    await send(cliente, 'post', '/api/pedidos', pedidoWeb({ cliente: '' })).expect(400);
  });

  it('valida que variante, extras, salsas e ingredientes pertenezcan al plato', async () => {
    const malos = [
      { varianteId: variante('Pizza', 'Grande') },
      { extras: [extra('Hamburguesa', 'Queso extra'), 999999] },
      { salsas: ['Salsa BBQ'] },
      { sin: ['Piña'] },
      { platoId: 999999 },
      { extras: [extra('Hamburguesa', 'Papas pequeña'), extra('Hamburguesa', 'Papas grande')] }, // mismo grupo
    ];
    for (const m of malos) {
      const res = await send(cliente, 'post', '/api/pedidos', pedidoWeb({ items: [burger(m)] }));
      expect(res.status, JSON.stringify(m)).toBe(400);
    }
    // la pizza no admite extras de la hamburguesa
    const res = await send(cliente, 'post', '/api/pedidos', pedidoWeb({
      items: [{ platoId: plato('Pizza').id, varianteId: variante('Pizza', 'Grande'), extras: [extra('Hamburguesa', 'Queso extra')] }],
    }));
    expect(res.status).toBe(400);
    await send(cliente, 'post', '/api/pedidos', pedidoWeb({ items: [] })).expect(400);
  });

  it('exige un método de pago activo', async () => {
    await send(cliente, 'post', '/api/pedidos', pedidoWeb({ metodoPago: undefined })).expect(400);
    await db('metodos_pago').where({ codigo: 'nq' }).update({ activo: false });
    await send(cliente, 'post', '/api/pedidos', pedidoWeb()).expect(400);
    await db('metodos_pago').where({ codigo: 'nq' }).update({ activo: true });
  });

  it('rechaza pedidos web con el local cerrado o la suscripción inactiva (403)', async () => {
    const fila = await db('config').where({ clave: 'general' }).first();
    const cfg = typeof fila.valor === 'string' ? JSON.parse(fila.valor) : fila.valor;
    await db('config').where({ clave: 'general' }).update({ valor: JSON.stringify({ ...cfg, h: Array(7).fill(null) }) });
    await send(cliente, 'post', '/api/pedidos', pedidoWeb()).expect(403);
    await abrirLocal();
    await db('suscripcion').where({ id: 1 }).update({ activa: false });
    await send(cliente, 'post', '/api/pedidos', pedidoWeb()).expect(403);
    await abrirLocal();
  });

  it('limita los pedidos web por IP (429)', async () => {
    const limitada = testApp({ pedidosWebMax: 2 });
    const a = await agente(limitada);
    await send(a, 'post', '/api/pedidos', pedidoWeb()).expect(201);
    await send(a, 'post', '/api/pedidos', pedidoWeb()).expect(201);
    await send(a, 'post', '/api/pedidos', pedidoWeb()).expect(429);
  });
});

describe('Fase 2 · pedidos del personal', () => {
  it('la mesera crea pedidos con destino libre, sin token ni método de pago', async () => {
    const res = await send(ana, 'post', '/api/pedidos', {
      destino: 'Mesa 3', metodoPago: 'nq', items: [burger({ extras: [], sin: [], salsas: [] })],
    }).expect(201);
    expect(res.body.token).toBeUndefined();
    expect(res.body.pedido).toMatchObject({ origen: 'mesera', destino: 'Mesa 3', total: 20000, metodoPago: null });
    expect(res.body.pedido.mesera).toEqual({ id: expect.any(Number), nombre: 'Ana' });
  });

  it('la mesera puede enviar mesa (validada) y domicilio sin datos del cliente', async () => {
    const res = await send(ana, 'post', '/api/pedidos', { destino: 'Mesa 3', mesa: 3, items: [burger()] }).expect(201);
    expect(res.body.pedido.destino).toBe('Mesa 3');
    const solo = await send(ana, 'post', '/api/pedidos', { destino: 'Mesa', mesa: 2, items: [burger()] }).expect(201);
    expect(solo.body.pedido.destino).toBe('Mesa 2');
    await send(ana, 'post', '/api/pedidos', { destino: 'Mesa 99', mesa: 99, items: [burger()] }).expect(400);
    await send(ana, 'post', '/api/pedidos', { destino: 'Mesa 99', items: [burger()] }).expect(400);
    await send(ana, 'post', '/api/pedidos', { destino: 'Mesa 3', mesa: 4, items: [burger()] }).expect(400);
    const dom = await send(ana, 'post', '/api/pedidos', { destino: 'Domicilio', items: [burger()] }).expect(201);
    expect(dom.body.pedido).toMatchObject({ destino: 'Domicilio', cliente: null, direccion: null, telefono: null });
    // PUT aplica la misma validación
    await send(ana, 'put', `/api/pedidos/${dom.body.pedido.id}`, { destino: 'Mesa 99', items: [burger()] }).expect(400);
  });

  it('ItemPedido trae varianteId para poder editar sin buscar por nombre', async () => {
    const { pedido } = (await send(ana, 'post', '/api/pedidos', { destino: 'Mesa 1', items: [burger()] }).expect(201)).body;
    const it0 = pedido.items[0];
    expect(it0.varianteId).toBe(variante('Hamburguesa', 'Doble carne'));
    // reenviar los ítems tal cual llegan sirve para editar
    const items = pedido.items.map(i => ({
      platoId: i.platoId, varianteId: i.varianteId, extras: i.extras.map(e => e.id), salsas: i.salsas, sin: i.sin, nota: i.nota,
    }));
    const res = await send(ana, 'put', `/api/pedidos/${pedido.id}`, { destino: 'Mesa 1', items }).expect(200);
    expect(res.body.total).toBe(pedido.total);
  });

  it('GET /api/pedidos lista los del día (más recientes primero) y filtra por estado', async () => {
    const res = await ana.get('/api/pedidos').expect(200);
    expect(res.body.length).toBeGreaterThan(3);
    expect(res.body[0].id).toBeGreaterThan(res.body[1].id);
    expect(res.body[0].items.length).toBeGreaterThan(0);
    const ayer = new Date(Date.now() - 3 * 864e5).toISOString();
    const vacio = await admin.get(`/api/pedidos?desde=${ayer}&hasta=${new Date(Date.now() - 2 * 864e5).toISOString()}`).expect(200);
    expect(vacio.body).toEqual([]);
    const nuevos = await admin.get('/api/pedidos?estado=entregado').expect(200);
    expect(nuevos.body.every(p => p.estado === 'entregado')).toBe(true);
    await request(app).get('/api/pedidos').expect(401);
  });

  it('PUT edita un pedido nuevo (la mesera solo los suyos) y recalcula', async () => {
    const { pedido } = (await send(ana, 'post', '/api/pedidos', { destino: 'Mesa 1', items: [burger()] }).expect(201)).body;
    const res = await send(ana, 'put', `/api/pedidos/${pedido.id}`, {
      destino: 'Mesa 2', cliente: 'Pedro', items: [burger({ extras: [] }), burger({ extras: [], varianteId: variante('Hamburguesa', 'Sencilla') })],
    }).expect(200);
    expect(res.body).toMatchObject({ id: pedido.id, destino: 'Mesa 2', cliente: 'Pedro', total: 34000, origen: 'mesera' });
    expect(res.body.items).toHaveLength(2);
    // un pedido web no es de la mesera
    const web = (await send(cliente, 'post', '/api/pedidos', pedidoWeb()).expect(201)).body;
    await send(ana, 'put', `/api/pedidos/${web.pedido.id}`, { destino: 'Mesa 2', items: [burger()] }).expect(403);
    // cocina puede editar cualquiera; el token se conserva
    const r2 = await send(admin, 'put', `/api/pedidos/${web.pedido.id}`, { destino: 'Domicilio', items: [burger({ extras: [] })] }).expect(200);
    expect(r2.body.origen).toBe('web');
    await request(app).get(`/api/pedidos/${web.pedido.id}?token=${web.token}`).expect(200);
    // ya en preparación: 409
    await send(admin, 'patch', `/api/pedidos/${pedido.id}/estado`, { estado: 'preparando' }).expect(200);
    await send(ana, 'put', `/api/pedidos/${pedido.id}`, { destino: 'Mesa 2', items: [burger()] }).expect(409);
  });
});

describe('Fase 2 · estado e inventario', () => {
  it('al pasar a preparando descuenta el inventario una sola vez, con conversión de unidades', async () => {
    const nombres = ['Pan', 'Carne', 'Queso', 'Tomate', 'Lechuga', 'Papas', 'Ketchup'];
    const antes = Object.fromEntries(await Promise.all(nombres.map(async n => [n, await stock(n)])));
    const { pedido } = (await send(cliente, 'post', '/api/pedidos', pedidoWeb()).expect(201)).body;
    const res = await send(admin, 'patch', `/api/pedidos/${pedido.id}/estado`, { estado: 'preparando' }).expect(200);
    expect(res.body.estado).toBe('preparando');
    const m = 1.8; // Doble carne
    const esperado = {
      Pan: antes.Pan - 1 * m,
      Carne: antes.Carne - (120 * m) / 453.592,
      Queso: antes.Queso - 25 * m - 30,
      Tomate: antes.Tomate, // "sin Tomate"
      Lechuga: antes.Lechuga - 15 * m,
      Papas: antes.Papas - 0.5,
      Ketchup: antes.Ketchup - 15,
    };
    for (const n of nombres) expect(await stock(n), n).toBeCloseTo(esperado[n], 2);
    // volver a preparando, listo o cancelar no descuenta ni devuelve
    await send(admin, 'patch', `/api/pedidos/${pedido.id}/estado`, { estado: 'nuevo' }).expect(200);
    await send(admin, 'patch', `/api/pedidos/${pedido.id}/estado`, { estado: 'preparando' }).expect(200);
    await send(admin, 'patch', `/api/pedidos/${pedido.id}/estado`, { estado: 'listo' }).expect(200);
    await send(admin, 'patch', `/api/pedidos/${pedido.id}/estado`, { estado: 'cancelado' }).expect(200);
    for (const n of nombres) expect(await stock(n), n).toBeCloseTo(esperado[n], 2);
  });

  it('el stock nunca queda negativo', async () => {
    await db('insumos').where({ nombre: 'Lechuga' }).update({ stock: 5 });
    const { pedido } = (await send(cliente, 'post', '/api/pedidos', pedidoWeb()).expect(201)).body;
    await send(admin, 'patch', `/api/pedidos/${pedido.id}/estado`, { estado: 'preparando' }).expect(200);
    expect(await stock('Lechuga')).toBe(0);
  });

  it('pasar directo de nuevo a listo también descuenta (una vez)', async () => {
    const antes = await stock('Pan');
    const { pedido } = (await send(cliente, 'post', '/api/pedidos', pedidoWeb()).expect(201)).body;
    await send(admin, 'patch', `/api/pedidos/${pedido.id}/estado`, { estado: 'listo' }).expect(200);
    expect(await stock('Pan')).toBeCloseTo(antes - 1.8, 3);
  });

  it('la mesera cancela sus propios pedidos solo si están en nuevo', async () => {
    const { pedido } = (await send(ana, 'post', '/api/pedidos', { destino: 'Mesa 4', items: [burger()] }).expect(201)).body;
    const res = await send(ana, 'patch', `/api/pedidos/${pedido.id}/estado`, { estado: 'cancelado' }).expect(200);
    expect(res.body.estado).toBe('cancelado');
    const web = (await send(cliente, 'post', '/api/pedidos', pedidoWeb()).expect(201)).body;
    expect((await send(ana, 'patch', `/api/pedidos/${web.pedido.id}/estado`, { estado: 'cancelado' }).expect(403)).body.code).toBe('PROHIBIDO');
    const otro = (await send(ana, 'post', '/api/pedidos', { destino: 'Mesa 4', items: [burger()] }).expect(201)).body.pedido;
    await send(admin, 'patch', `/api/pedidos/${otro.id}/estado`, { estado: 'preparando' }).expect(200);
    await send(ana, 'patch', `/api/pedidos/${otro.id}/estado`, { estado: 'cancelado' }).expect(403);
  });

  it('la mesera solo puede pasar de listo a entregado', async () => {
    const { pedido } = (await send(ana, 'post', '/api/pedidos', { destino: 'Mesa 4', items: [burger()] }).expect(201)).body;
    let res = await send(ana, 'patch', `/api/pedidos/${pedido.id}/estado`, { estado: 'preparando' }).expect(403);
    expect(res.body.code).toBe('PROHIBIDO');
    await send(admin, 'patch', `/api/pedidos/${pedido.id}/estado`, { estado: 'listo' }).expect(200);
    res = await send(ana, 'patch', `/api/pedidos/${pedido.id}/estado`, { estado: 'entregado' }).expect(200);
    expect(res.body.estado).toBe('entregado');
    await send(admin, 'patch', `/api/pedidos/${pedido.id}/estado`, { estado: 'otro' }).expect(400);
    await send(admin, 'patch', '/api/pedidos/999999/estado', { estado: 'listo' }).expect(404);
  });
});

describe('Fase 2 · pago', () => {
  it('registra el pago con método, fecha y quién cobró', async () => {
    const { pedido } = (await send(ana, 'post', '/api/pedidos', { destino: 'Mesa 5', items: [burger()] }).expect(201)).body;
    await send(ana, 'post', `/api/pedidos/${pedido.id}/pago`, { metodoPago: 'xx' }).expect(400);
    const res = await send(ana, 'post', `/api/pedidos/${pedido.id}/pago`, { metodoPago: 'ef' }).expect(200);
    expect(res.body).toMatchObject({
      pagoEstado: 'pagado', metodoPago: { codigo: 'ef', nombre: 'Efectivo' }, cobradoPor: { id: expect.any(Number), nombre: 'Ana' },
    });
    expect(new Date(res.body.pagadoEn).getTime()).toBeGreaterThan(Date.now() - 60e3);
    await send(ana, 'post', `/api/pedidos/${pedido.id}/pago`, { metodoPago: 'ef' }).expect(409);
    await send(cliente, 'post', `/api/pedidos/${pedido.id}/pago`, { metodoPago: 'ef' }).expect(401);
  });
});
