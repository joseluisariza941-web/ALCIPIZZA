import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { abrirLocal, agente, db, entrarComo, instantanea, send, testApp } from './helpers.js';

const app = testApp();
let restaurar, admin, ana, menu;
const hamb = () => menu.find(p => p.nombre === 'Hamburguesa');
const precio = () => hamb().variantes[0].precio;
const item = () => ({ platoId: hamb().id, varianteId: hamb().variantes[0].id });
const CEL = '3001234567';
const web = (o = {}) => ({ destino: 'Recoger en local', cliente: 'Juan', telefono: CEL, metodoPago: 'nq', items: [item()], ...o });
const pedirWeb = async (o = {}) => {
  const a = await agente(app);
  const r = (await send(a, 'post', '/api/pedidos', web(o)).expect(201)).body;
  return { ...r.pedido, token: r.token, a };
};
const pedirMesa = async (o = {}) => (await send(ana, 'post', '/api/pedidos', { destino: 'Mesa 3', items: [item()], ...o }).expect(201)).body.pedido;
const pagar = (id, o = {}, quien = ana) => send(quien, 'post', `/api/pedidos/${id}/pago`, { metodoPago: 'nq', ...o });
const fila = id => db('pedidos').where({ id }).first();
const saldo = async (cel = CEL) => (await db('puntos_clientes').where({ celular: cel }).first())?.saldo ?? 0;
const movs = async (cel = CEL) => (await db('puntos_movimientos').where({ celular: cel }).orderBy('id')).map(m => [m.tipo, m.puntos]);
const dar = n => db('puntos_clientes').insert({ celular: CEL, saldo: n });
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

describe('Canje de puntos solo en caja · el cliente web', () => {
  it('un pedido web con canjearPuntos > 0 responde 403 PUNTOS_SOLO_CAJA y no mueve nada', async () => {
    await dar(300);
    const antes = (await db('pedidos').count({ n: '*' }).first()).n;
    const r = await send(await agente(app), 'post', '/api/pedidos', web({ celular: CEL, canjearPuntos: 100 })).expect(403);
    expect(r.body.code).toBe('PUNTOS_SOLO_CAJA');
    expect((await db('pedidos').count({ n: '*' }).first()).n).toBe(antes);
    expect(await saldo()).toBe(300);
    expect(await movs()).toEqual([]);
    await pedirWeb({ celular: CEL, canjearPuntos: 0 });
  });

  it('la edición del cliente con canjearPuntos > 0 también responde 403', async () => {
    await dar(300);
    const p = await pedirWeb({ celular: CEL });
    const r = await send(p.a, 'put', `/api/pedidos/${p.id}/cliente`, { ...web({ celular: CEL, canjearPuntos: 100 }), token: p.token }).expect(403);
    expect(r.body.code).toBe('PUNTOS_SOLO_CAJA');
    expect(await saldo()).toBe(300);
    expect((await fila(p.id)).puntos_canjeados).toBe(0);
  });

  it('la cotización pública tampoco permite canjear', async () => {
    await dar(300);
    const r = await send(await agente(app), 'post', '/api/pedidos/cotizar', web({ celular: CEL, canjearPuntos: 100 })).expect(403);
    expect(r.body.code).toBe('PUNTOS_SOLO_CAJA');
  });
});

describe('Canje de puntos solo en caja · al cobrar', () => {
  it('descuenta del total y del saldo, marca pagado y gana sobre el total final', async () => {
    await dar(350);
    const p = await pedirWeb({ celular: CEL });
    const r = (await pagar(p.id, { canjearPuntos: 100 }).expect(200)).body;
    const total = precio() - 1000;
    expect(r).toMatchObject({ pagoEstado: 'pagado', puntosCanjeados: 100, descuentoPuntos: 1000, subtotal: precio(), total });
    const ganados = Math.floor(total / 1000);
    expect(r.puntosGanados).toBe(ganados);
    expect(await saldo()).toBe(250 + ganados);
    expect(await movs()).toEqual([['canjeado', -100], ['ganado', ganados]]);
  });

  it('guarda el celular que viene en el cobro y suma los puntos a ese celular', async () => {
    await dar(200);
    const p = await pedirWeb();
    expect(p.celular).toBeNull();
    const r = (await pagar(p.id, { celular: '+57 300-123 4567', canjearPuntos: 100 }).expect(200)).body;
    expect(r.celular).toBe(CEL);
    expect(r.puntosCanjeados).toBe(100);
    expect(await saldo()).toBe(100 + Math.floor((precio() - 1000) / 1000));
  });

  it('sin canje, el cobro acepta el celular y acumula como siempre', async () => {
    const p = await pedirMesa();
    const r = (await pagar(p.id, { celular: CEL }).expect(200)).body;
    expect(r).toMatchObject({ celular: CEL, puntosCanjeados: 0, total: precio() });
    expect(await saldo()).toBe(Math.floor(precio() / 1000));
    const q = await pedirMesa();
    await pagar(q.id, { celular: '123' }).expect(400);
    expect((await fila(q.id)).pago_estado).not.toBe('pagado');
  });

  it('se aplica después de la promoción', async () => {
    await dar(100);
    await send(admin, 'post', '/api/promociones', {
      nombre: 'P', tipo: 'porcentaje', alcance: 'plato', platoId: hamb().id, valor: 10, inicio: '2020-01-01', fin: '2099-12-31',
    }).expect(201);
    const promo = Math.round(precio() * 0.1);
    const p = await pedirWeb({ celular: CEL });
    const r = (await pagar(p.id, { canjearPuntos: 100 }).expect(200)).body;
    expect(r).toMatchObject({ descuentoPromo: promo, descuentoPuntos: 1000, total: precio() - promo - 1000 });
  });

  it('los canjes no válidos no cambian nada: ni pago, ni celular, ni puntos', async () => {
    await dar(250);
    const p = await pedirWeb();
    const malo = async (o, st, code) => {
      const r = await pagar(p.id, o).expect(st);
      if (code) expect(r.body.code).toBe(code);
      const f = await fila(p.id);
      expect(f.pago_estado).not.toBe('pagado');
      expect(f.celular).toBeNull();
      expect(f.puntos_canjeados).toBe(0);
      expect(Number(f.total)).toBe(precio());
      expect(await saldo()).toBe(250);
      expect(await movs()).toEqual([]);
    };
    await malo({ celular: CEL, canjearPuntos: 150 }, 400, 'PUNTOS_INVALIDOS');
    await malo({ celular: CEL, canjearPuntos: 300 }, 409, 'PUNTOS_INSUFICIENTES');
    await malo({ canjearPuntos: 100 }, 400);
    await malo({ celular: '3109999999', canjearPuntos: 100 }, 409, 'PUNTOS_INSUFICIENTES');
    await malo({ celular: CEL, canjearPuntos: -100 }, 400);
    await malo({ celular: CEL, canjearPuntos: 1.5 }, 400);
    await ajustes({ descuentoCanje: 100000 });
    await malo({ celular: CEL, canjearPuntos: 200 }, 400, 'PUNTOS_EXCEDEN');
    await ajustes({ puntosActivos: false });
    await malo({ celular: CEL, canjearPuntos: 100 }, 400, 'PUNTOS_INACTIVOS');
  });

  it('un método de pago no válido tampoco mueve puntos', async () => {
    await dar(100);
    const p = await pedirWeb({ celular: CEL });
    await pagar(p.id, { metodoPago: 'zzz', canjearPuntos: 100 }).expect(400);
    expect(await saldo()).toBe(100);
    expect(await movs()).toEqual([]);
  });

  it('un pedido ya pagado no se vuelve a cobrar ni canjea otra vez', async () => {
    await dar(200);
    const p = await pedirWeb({ celular: CEL });
    await pagar(p.id, { canjearPuntos: 100 }).expect(200);
    const despues = await saldo();
    await pagar(p.id, { canjearPuntos: 100 }).expect(409);
    expect(await saldo()).toBe(despues);
  });

  it('un pedido de la mesera con canje previo se reliquida con el canje del cobro', async () => {
    await dar(300);
    const p = await pedirMesa({ celular: CEL, canjearPuntos: 100 });
    expect(await saldo()).toBe(200);
    const r = (await pagar(p.id, { canjearPuntos: 200 }).expect(200)).body;
    expect(r).toMatchObject({ puntosCanjeados: 200, descuentoPuntos: 2000, total: precio() - 2000 });
    expect(await saldo()).toBe(100 + Math.floor((precio() - 2000) / 1000));
  });

  it('cocina también puede canjear al cobrar', async () => {
    await dar(100);
    const p = await pedirMesa({ celular: CEL });
    const r = (await pagar(p.id, { canjearPuntos: 100 }, admin).expect(200)).body;
    expect(r.puntosCanjeados).toBe(100);
  });

  it('al cancelar un pedido cobrado con canje se devuelven los puntos', async () => {
    await dar(100);
    const p = await pedirWeb({ celular: CEL });
    await pagar(p.id, { canjearPuntos: 100 }).expect(200);
    const g = Math.floor((precio() - 1000) / 1000);
    expect(await saldo()).toBe(g);
    await send(admin, 'patch', `/api/pedidos/${p.id}/estado`, { estado: 'cancelado' }).expect(200);
    expect(await saldo()).toBe(100);
    expect(await movs()).toEqual([['canjeado', -100], ['ganado', g], ['devuelto', 100], ['revertido', -g]]);
  });
});

describe('Canje de puntos solo en caja · el personal', () => {
  it('la mesera sigue pudiendo crear y editar pedidos con canje', async () => {
    await dar(300);
    const p = await pedirMesa({ celular: CEL, canjearPuntos: 100 });
    expect(p).toMatchObject({ puntosCanjeados: 100, descuentoPuntos: 1000, total: precio() - 1000 });
    const e = (await send(ana, 'put', `/api/pedidos/${p.id}`, { destino: 'Mesa 3', items: [item()], celular: CEL, canjearPuntos: 200 }).expect(200)).body;
    expect(e).toMatchObject({ puntosCanjeados: 200, descuentoPuntos: 2000, total: precio() - 2000 });
    expect(await saldo()).toBe(100);
  });
});
