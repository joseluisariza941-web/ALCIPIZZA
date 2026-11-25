import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { abrirLocal, agente, db, entrarComo, instantanea, send, testApp } from './helpers.js';

const app = testApp();
const limitada = testApp({ pedidosWebMax: 2 });
let restaurar, admin, ana, menu;
const hamb = () => menu.find(p => p.nombre === 'Hamburguesa');
const precio = () => hamb().variantes[0].precio;
const item = () => ({ platoId: hamb().id, varianteId: hamb().variantes[0].id });
const CEL = '3001234567';
const web = (o = {}) => ({ destino: 'Recoger en local', cliente: 'Juan', telefono: CEL, metodoPago: 'nq', items: [item()], ...o });
const pedir = async (o, esperado = 201) => (await send(await agente(app), 'post', '/api/pedidos', web(o)).expect(esperado)).body.pedido;
const pedirMesa = async (o, esperado = 201) => (await send(ana, 'post', '/api/pedidos', web(o)).expect(esperado)).body.pedido;
const pagar = id => send(admin, 'post', `/api/pedidos/${id}/pago`, { metodoPago: 'nq' });
const estado = (id, e) => send(admin, 'patch', `/api/pedidos/${id}/estado`, { estado: e });
const saldo = async (cel = CEL) => (await db('puntos_clientes').where({ celular: cel }).first())?.saldo ?? 0;
const movs = async (cel = CEL) => (await db('puntos_movimientos').where({ celular: cel }).orderBy('id')).map(m => [m.tipo, m.puntos]);
const dar = (n, cel = CEL) => db('puntos_clientes').insert({ celular: cel, saldo: n });
const ajustes = o => send(admin, 'put', '/api/config', { puntosActivos: true, puntosPorMil: 1, puntosCanje: 100, descuentoCanje: 1000, ...o }).expect(200);

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
  await ajustes();
});
afterAll(async () => {
  await db('puntos_movimientos').del();
  await db('puntos_clientes').del();
  await restaurar();
  await db.destroy();
});

describe('Fase 3 · B10 celular y ajustes', () => {
  it('normaliza el celular y rechaza los no válidos', async () => {
    expect((await pedir({ celular: '+57 300-123 4567' })).celular).toBe(CEL);
    expect((await pedir({ celular: '' })).celular).toBeNull();
    for (const c of ['abc', '2001234567', '30012345', '30012345678901']) {
      await send(await agente(app), 'post', '/api/pedidos', web({ celular: c })).expect(400);
    }
    await send(await agente(app), 'post', '/api/pedidos', web({ canjearPuntos: -1 })).expect(400);
    await send(await agente(app), 'post', '/api/pedidos', web({ canjearPuntos: 1.5 })).expect(400);
  });

  it('valida los ajustes de puntos', async () => {
    await send(admin, 'put', '/api/config', { puntosPorMil: -1 }).expect(400);
    await send(admin, 'put', '/api/config', { puntosCanje: 0 }).expect(400);
    await send(admin, 'put', '/api/config', { puntosActivos: 'si' }).expect(400);
    const r = (await request(app).get('/api/public/config')).body;
    expect(r.puntos).toEqual({ activo: true, porMil: 1, puntosCanje: 100, descuentoCanje: 1000 });
  });
});

describe('Fase 3 · B10 ganar puntos', () => {
  it('suma al confirmar el pago, una sola vez', async () => {
    const p = await pedir({ celular: CEL });
    expect(await saldo()).toBe(0);
    const ok = (await pagar(p.id).expect(200)).body;
    const ganados = Math.floor(precio() / 1000);
    expect(ok.puntosGanados).toBe(ganados);
    expect(await saldo()).toBe(ganados);
    expect(await movs()).toEqual([['ganado', ganados]]);
    await pagar(p.id).expect(409);
    expect(await saldo()).toBe(ganados);
  });

  it('usa puntosPorMil', async () => {
    await ajustes({ puntosPorMil: 3 });
    const p = await pedir({ celular: CEL });
    await pagar(p.id).expect(200);
    expect(await saldo()).toBe(Math.floor(precio() / 1000) * 3);
  });

  it('no suma con el programa apagado ni sin celular', async () => {
    const sin = await pedir();
    await pagar(sin.id).expect(200);
    await ajustes({ puntosActivos: false });
    const p = await pedir({ celular: CEL });
    await pagar(p.id).expect(200);
    expect(await saldo()).toBe(0);
    expect(await movs()).toEqual([]);
  });

  it('un pedido cancelado no suma, y al cancelar uno pagado se revierte', async () => {
    const a = await pedir({ celular: CEL });
    await estado(a.id, 'cancelado').expect(200);
    await pagar(a.id).expect(200);
    expect(await saldo()).toBe(0);
    const b = await pedir({ celular: CEL });
    await pagar(b.id).expect(200);
    const g = Math.floor(precio() / 1000);
    expect(await saldo()).toBe(g);
    const c = (await estado(b.id, 'cancelado').expect(200)).body;
    expect(c.puntosGanados).toBe(0);
    expect(await saldo()).toBe(0);
    expect(await movs()).toEqual([['ganado', g], ['revertido', -g]]);
  });

  it('el pedido de la mesera también acumula', async () => {
    const r = await send(ana, 'post', '/api/pedidos', { destino: 'Barra', celular: CEL, items: [item()] }).expect(201);
    await pagar(r.body.pedido.id).expect(200);
    expect(await saldo()).toBe(Math.floor(precio() / 1000));
  });
});

describe('Fase 3 · B10 canjear puntos (personal)', () => {
  it('descuenta del total y del saldo', async () => {
    await dar(350);
    const p = await pedirMesa({ celular: CEL, canjearPuntos: 100 });
    expect(p).toMatchObject({ puntosCanjeados: 100, descuentoPuntos: 1000, subtotal: precio(), total: precio() - 1000 });
    expect(await saldo()).toBe(250);
    expect(await movs()).toEqual([['canjeado', -100]]);
    const q = await send(ana, 'post', '/api/pedidos/cotizar', web({ celular: CEL, canjearPuntos: 200 })).expect(200);
    expect(q.body).toMatchObject({ puntosCanjeados: 200, descuentoPuntos: 2000, total: precio() - 2000 });
    expect(await saldo()).toBe(250);
  });

  it('se aplica después de la promoción', async () => {
    await dar(100);
    await send(admin, 'post', '/api/promociones', {
      nombre: 'P', tipo: 'porcentaje', alcance: 'plato', platoId: hamb().id, valor: 10,
      inicio: '2020-01-01', fin: '2099-12-31',
    }).expect(201);
    const promo = Math.round(precio() * 0.1);
    const p = await pedirMesa({ celular: CEL, canjearPuntos: 100 });
    expect(p).toMatchObject({ descuentoPromo: promo, descuentoPuntos: 1000, total: precio() - promo - 1000 });
  });

  it('rechaza los canjes no válidos', async () => {
    await dar(250);
    const malo = async (o, st, code) => {
      const r = await send(ana, 'post', '/api/pedidos', web(o)).expect(st);
      if (code) expect(r.body.code).toBe(code);
    };
    await malo({ celular: CEL, canjearPuntos: 150 }, 400, 'PUNTOS_INVALIDOS');
    await malo({ celular: CEL, canjearPuntos: 300 }, 409, 'PUNTOS_INSUFICIENTES');
    await malo({ canjearPuntos: 100 }, 400);
    await malo({ celular: '3109999999', canjearPuntos: 100 }, 409, 'PUNTOS_INSUFICIENTES');
    await ajustes({ descuentoCanje: 100000 });
    await malo({ celular: CEL, canjearPuntos: 200 }, 400, 'PUNTOS_EXCEDEN');
    await ajustes({ puntosActivos: false });
    await malo({ celular: CEL, canjearPuntos: 100 }, 400, 'PUNTOS_INACTIVOS');
    expect(await saldo()).toBe(250);
  });

  it('al cancelar se devuelven los puntos canjeados', async () => {
    await dar(100);
    const p = await pedirMesa({ celular: CEL, canjearPuntos: 100 });
    expect(await saldo()).toBe(0);
    await estado(p.id, 'cancelado').expect(200);
    expect(await saldo()).toBe(100);
    expect(await movs()).toEqual([['canjeado', -100], ['devuelto', 100]]);
    await estado(p.id, 'cancelado').expect(200); // repetir no devuelve otra vez
    expect(await saldo()).toBe(100);
  });
});

describe('Fase 3 · B10 consulta de puntos', () => {
  it('el saldo público solo muestra el saldo del celular pedido', async () => {
    await dar(70);
    const r = await request(app).get(`/api/public/puntos/${CEL}`).expect(200);
    expect(r.body).toEqual({ celular: CEL, activo: true, saldo: 70, puntosCanje: 100, descuentoCanje: 1000 });
    expect((await request(app).get('/api/public/puntos/3109999999').expect(200)).body.saldo).toBe(0);
    await request(app).get('/api/public/puntos/12345').expect(400);
  });

  it('limita las consultas de saldo (429)', async () => {
    for (let i = 0; i < 3; i++) await request(limitada).get(`/api/public/puntos/${CEL}`).expect(200);
    await request(limitada).get(`/api/public/puntos/${CEL}`).expect(429);
  });

  it('cocina ve clientes y movimientos; la mesera no', async () => {
    await dar(70);
    await dar(5, '3109999999');
    const l = (await admin.get('/api/puntos/clientes').expect(200)).body;
    expect(l.map(c => c.celular)).toEqual([CEL, '3109999999']);
    expect(l[0]).toEqual({ celular: CEL, nombre: null, saldo: 70, actualizadoEn: expect.any(String) });
    expect((await admin.get('/api/puntos/clientes?q=9999').expect(200)).body).toHaveLength(1);
    const p = await pedir({ celular: CEL });
    await pagar(p.id).expect(200);
    const m = (await admin.get(`/api/puntos/clientes/${CEL}/movimientos`).expect(200)).body;
    expect(m).toMatchObject({ celular: CEL, nombre: 'Juan', movimientos: [{ pedidoId: p.id, tipo: 'ganado', puntos: Math.floor(precio() / 1000) }] });
    await admin.get('/api/puntos/clientes/3208888888/movimientos').expect(404);
    await ana.get('/api/puntos/clientes').expect(403);
    await ana.get(`/api/puntos/clientes/${CEL}/movimientos`).expect(403);
    await request(app).get('/api/puntos/clientes').expect(401);
  });
});
