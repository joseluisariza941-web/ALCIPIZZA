import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { abrirLocal, agente, db, entrarComo, instantanea, send, testApp } from './helpers.js';

const app = testApp();
const limitada = testApp({ pedidosWebMax: 2 });
let restaurar, admin, ana, menu;
const hamb = () => menu.find(p => p.nombre === 'Hamburguesa');
const precio = () => hamb().variantes[0].precio;
const item = () => ({ platoId: hamb().id, varianteId: hamb().variantes[0].id });
const web = (o = {}) => ({ destino: 'Recoger en local', cliente: 'Juan', telefono: '3001234567', metodoPago: 'nq', items: [item()], ...o });
const nuevo = async (o = {}, ag) => {
  const a = ag || await agente(app);
  const r = (await send(a, 'post', '/api/pedidos', web(o)).expect(201)).body;
  return { ...r.pedido, token: r.token, a };
};
const cancelar = (p, token = p.token, a = p.a) => send(a, 'post', `/api/pedidos/${p.id}/cancelar`, { token });
const editar = (p, o = {}, token = p.token, a = p.a) => send(a, 'put', `/api/pedidos/${p.id}/cliente`, { ...web(o), token });
const stock = async () => Object.fromEntries((await db('insumos').select('id', 'stock')).map(i => [i.id, Number(i.stock)]));

beforeAll(async () => {
  restaurar = await instantanea();
  await abrirLocal();
  menu = (await request(app).get('/api/menu')).body;
  admin = await entrarComo(app, 'admin');
  ana = await entrarComo(app, 'ana');
});
beforeEach(async () => {
  await db('puntos_movimientos').del();
  await db('puntos_clientes').del();
  await db('promociones').del();
  await send(admin, 'put', '/api/config', { puntosActivos: true, puntosPorMil: 1, puntosCanje: 100, descuentoCanje: 1000, domiciliosActivos: true }).expect(200);
});
afterAll(async () => {
  await db('puntos_movimientos').del();
  await db('puntos_clientes').del();
  await restaurar();
  await db.destroy();
});

describe('Fase 3 · B7 el cliente cancela su pedido', () => {
  it('cancela con el token mientras está nuevo', async () => {
    const p = await nuevo();
    const r = (await cancelar(p).expect(200)).body;
    expect(r).toMatchObject({ id: p.id, estado: 'cancelado', canceladoPorCliente: true });
    const t = (await request(app).get(`/api/pedidos/${p.id}?token=${p.token}`).expect(200)).body;
    expect(t.estado).toBe('cancelado');
  });

  it('token incorrecto o ausente da 404 y no cancela', async () => {
    const p = await nuevo();
    await cancelar(p, 'x'.repeat(32)).expect(404);
    await cancelar(p, '').expect(404);
    await send(p.a, 'post', `/api/pedidos/${p.id}/cancelar`, {}).expect(404);
    const otro = await nuevo();
    await cancelar(p, otro.token).expect(404); // el token de otro pedido no sirve
    expect((await db('pedidos').where({ id: p.id }).first()).estado).toBe('nuevo');
  });

  it('el pedido del personal no se puede cancelar por aquí', async () => {
    const r = await send(ana, 'post', '/api/pedidos', { destino: 'Barra', items: [item()] }).expect(201);
    await send(await agente(app), 'post', `/api/pedidos/${r.body.pedido.id}/cancelar`, { token: 'abc' }).expect(404);
  });

  it('no cancela si ya salió de "nuevo"', async () => {
    const p = await nuevo();
    await send(admin, 'patch', `/api/pedidos/${p.id}/estado`, { estado: 'preparando' }).expect(200);
    const r = await cancelar(p).expect(409);
    expect(r.body.code).toBe('NO_EDITABLE');
    expect((await db('pedidos').where({ id: p.id }).first()).estado).toBe('preparando');
  });

  it('cuando la cocina cancela un pedido pagado devuelve los puntos canjeados y quita los ganados', async () => {
    await db('puntos_clientes').insert({ celular: '3001234567', saldo: 100 });
    const p = await nuevo({ celular: '3001234567' });
    await send(ana, 'post', `/api/pedidos/${p.id}/pago`, { metodoPago: 'nq', canjearPuntos: 100 }).expect(200);
    expect((await db('puntos_clientes').where({ celular: '3001234567' }).first()).saldo).toBe(Math.floor((precio() - 1000) / 1000));
    await send(admin, 'patch', `/api/pedidos/${p.id}/estado`, { estado: 'cancelado' }).expect(200);
    expect((await db('puntos_clientes').where({ celular: '3001234567' }).first()).saldo).toBe(100);
  });

  it('repone el inventario si ya estaba descontado', async () => {
    const p = await nuevo();
    const antes = await stock();
    await db('pedidos').where({ id: p.id }).update({ inventario_descontado: 1 });
    await cancelar(p).expect(200);
    const despues = await stock();
    const subio = Object.keys(antes).filter(k => despues[k] > antes[k]);
    expect(subio.length).toBeGreaterThan(0);
    expect((await db('pedidos').where({ id: p.id }).first()).inventario_descontado).toBe(0);
    for (const k of Object.keys(antes)) expect(despues[k]).toBeGreaterThanOrEqual(antes[k]);
  });
});

describe('Fase 3 · B7 el cliente edita su pedido', () => {
  it('reemplaza los ítems, recalcula y conserva el token', async () => {
    const p = await nuevo();
    const r = (await editar(p, { items: [item(), item()], cliente: 'Juana' }).expect(200)).body;
    expect(r).toMatchObject({ id: p.id, cliente: 'Juana', subtotal: precio() * 2, total: precio() * 2, estado: 'nuevo', editadoEn: expect.any(String) });
    expect(r.items).toHaveLength(2);
    expect(r.token).toBeUndefined();
    const t = (await request(app).get(`/api/pedidos/${p.id}?token=${p.token}`).expect(200)).body;
    expect(t.items).toHaveLength(2);
    await editar(p, { items: [item()] }).expect(200); // el mismo token sigue valiendo
  });

  it('reliquida con promoción y no permite canjear puntos', async () => {
    await send(admin, 'post', '/api/promociones', {
      nombre: 'P', tipo: 'monto', alcance: 'plato', platoId: hamb().id, valor: 1000, inicio: '2020-01-01', fin: '2099-12-31',
    }).expect(201);
    await db('puntos_clientes').insert({ celular: '3001234567', saldo: 200 });
    const p = await nuevo({ celular: '3001234567' });
    expect(p.total).toBe(precio() - 1000);
    const r = (await editar(p, { items: [item(), item()], celular: '3001234567' }).expect(200)).body;
    expect(r).toMatchObject({ subtotal: precio() * 2, descuentoPromo: 2000, puntosCanjeados: 0, descuentoPuntos: 0, total: precio() * 2 - 2000 });
    const canje = await editar(p, { celular: '3001234567', canjearPuntos: 200 }).expect(403);
    expect(canje.body.code).toBe('PUNTOS_SOLO_CAJA');
    const sinCanje = (await editar(p, { celular: '3001234567', canjearPuntos: 0 }).expect(200)).body;
    expect(sinCanje).toMatchObject({ puntosCanjeados: 0, descuentoPuntos: 0, total: precio() - 1000 });
    expect((await db('puntos_clientes').where({ celular: '3001234567' }).first()).saldo).toBe(200);
  });

  it('ignora el precio que mande el cliente y valida como un pedido nuevo', async () => {
    const p = await nuevo();
    const r = (await editar(p, { total: 1 }).expect(200)).body;
    expect(r.total).toBe(precio());
    await editar(p, { items: [] }).expect(400);
    await editar(p, { destino: 'Domicilio', direccion: '', telefono: '3001234567' }).expect(400);
    await editar(p, { metodoPago: 'zzz' }).expect(400);
  });

  it('token incorrecto 404; pedido no nuevo o pagado 409', async () => {
    const p = await nuevo();
    await editar(p, {}, 'mal').expect(404);
    await send(admin, 'post', `/api/pedidos/${p.id}/pago`, { metodoPago: 'nq' }).expect(200);
    expect((await editar(p).expect(409)).body.code).toBe('NO_EDITABLE');
    const q = await nuevo();
    await send(admin, 'patch', `/api/pedidos/${q.id}/estado`, { estado: 'listo' }).expect(200);
    await editar(q).expect(409);
    const c = await nuevo();
    await cancelar(c).expect(200);
    await editar(c).expect(409);
  });

  it('el pedido del personal no se edita por aquí', async () => {
    const r = await send(ana, 'post', '/api/pedidos', { destino: 'Barra', items: [item()] }).expect(201);
    await send(await agente(app), 'put', `/api/pedidos/${r.body.pedido.id}/cliente`, { ...web(), token: 'abc' }).expect(404);
  });

  it('respeta la regla de domicilios apagados', async () => {
    const p = await nuevo();
    await send(admin, 'put', '/api/config', { domiciliosActivos: false }).expect(200);
    const r = await editar(p, { destino: 'Domicilio', direccion: 'Calle 1 # 2-3', telefono: '3001234567' }).expect(409);
    expect(r.body.code).toBe('DOMICILIOS_APAGADOS');
    await editar(p).expect(200); // recoger en local sigue permitido
  });

  it('repone el inventario descontado al editar', async () => {
    const p = await nuevo();
    await db('pedidos').where({ id: p.id }).update({ inventario_descontado: 1 });
    const antes = await stock();
    await editar(p).expect(200);
    const despues = await stock();
    expect(Object.keys(antes).some(k => despues[k] > antes[k])).toBe(true);
    expect((await db('pedidos').where({ id: p.id }).first()).inventario_descontado).toBe(0);
  });
});

describe('Fase 3 · B7 límites', () => {
  it('limita los intentos de cancelar o editar (429)', async () => {
    const a = await agente(limitada);
    for (let i = 0; i < 3; i++) await send(a, 'post', '/api/pedidos/999999/cancelar', { token: 'x' }).expect(404);
    await send(a, 'post', '/api/pedidos/999999/cancelar', { token: 'x' }).expect(429);
    await send(a, 'put', '/api/pedidos/999999/cliente', { ...web(), token: 'x' }).expect(429);
  });
});
