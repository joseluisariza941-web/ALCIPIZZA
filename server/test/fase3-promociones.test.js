import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { abrirLocal, agente, db, entrarComo, instantanea, send, testApp } from './helpers.js';

const app = testApp();
let restaurar, admin, ana, menu;
const hamb = () => menu.find(p => p.nombre === 'Hamburguesa');
const precio = () => hamb().variantes[0].precio;
const item = () => ({ platoId: hamb().id, varianteId: hamb().variantes[0].id });
const web = (o = {}) => ({ destino: 'Recoger en local', cliente: 'Juan', telefono: '3001234567', metodoPago: 'nq', items: [item()], ...o });
const dia = (delta = 0) => new Date(Date.now() - 5 * 3600e3 + delta * 86400e3).toISOString().slice(0, 10);
const base = (o = {}) => ({ nombre: 'Promo T3', tipo: 'porcentaje', alcance: 'plato', platoId: hamb().id, valor: 10, inicio: dia(-1), fin: dia(1), ...o });
const crear = async o => (await send(admin, 'post', '/api/promociones', base(o)).expect(201)).body;
const pedir = async (o, a) => (await send(a || await agente(app), 'post', '/api/pedidos', web(o)).expect(201)).body.pedido;

beforeAll(async () => {
  restaurar = await instantanea();
  await abrirLocal();
  menu = (await request(app).get('/api/menu')).body;
  admin = await entrarComo(app, 'admin');
  ana = await entrarComo(app, 'ana');
});
afterEach(async () => { await db('promociones').del(); });
afterAll(async () => { await restaurar(); await db('promociones').del(); await db.destroy(); });

describe('Fase 3 · B11 CRUD de promociones', () => {
  it('crea, lista, edita y borra', async () => {
    const p = await crear({ dias: [0, 1, 2], horaDesde: '10:00', horaHasta: '14:30' });
    expect(p).toEqual({
      id: expect.any(Number), nombre: 'Promo T3', tipo: 'porcentaje', alcance: 'plato', platoId: hamb().id, categoria: null,
      valor: 10, montoMinimo: null, inicio: dia(-1), fin: dia(1), dias: [0, 1, 2], horaDesde: '10:00', horaHasta: '14:30',
      activa: true, vigente: expect.any(Boolean), etiqueta: '10% de descuento',
    });
    expect((await admin.get('/api/promociones').expect(200)).body.map(x => x.id)).toContain(p.id);
    const ed = await send(admin, 'put', `/api/promociones/${p.id}`, { valor: 15, activa: false, dias: null }).expect(200);
    expect(ed.body).toMatchObject({ valor: 15, activa: false, dias: null, vigente: false });
    await send(admin, 'delete', `/api/promociones/${p.id}`).expect(200, { ok: true });
    expect((await admin.get('/api/promociones')).body.map(x => x.id)).not.toContain(p.id);
    expect((await admin.get('/api/promociones?eliminados=1')).body.find(x => x.id === p.id).eliminadoEn).toEqual(expect.any(String));
    await send(admin, 'delete', `/api/promociones/${p.id}`).expect(404);
    await send(admin, 'put', `/api/promociones/${p.id}`, { valor: 5 }).expect(404);
    await send(admin, 'post', `/api/promociones/${p.id}/restaurar`).expect(200);
    expect((await admin.get('/api/promociones')).body.map(x => x.id)).toContain(p.id);
    await send(admin, 'post', `/api/promociones/${p.id}/restaurar`).expect(404);
  });

  it('por categoría y al total', async () => {
    const c = await crear({ alcance: 'categoria', platoId: undefined, categoria: hamb().categoria, tipo: 'monto', valor: 2000 });
    expect(c).toMatchObject({ alcance: 'categoria', categoria: hamb().categoria, platoId: null, etiqueta: '$2.000 de descuento' });
    const t = await crear({ alcance: 'total', platoId: undefined, valor: 5, montoMinimo: 50000 });
    expect(t).toMatchObject({ alcance: 'total', montoMinimo: 50000, etiqueta: '5% de descuento desde $50.000' });
  });

  it('valida los datos y exige rol cocina', async () => {
    const malos = [
      { valor: 101 }, { valor: 0 }, { tipo: 'monto', valor: -5 }, { nombre: '' }, { tipo: 'x' }, { alcance: 'x' },
      { platoId: undefined }, { platoId: 999999 }, { alcance: 'categoria', platoId: undefined, categoria: 'No existe' },
      { alcance: 'categoria', platoId: undefined }, { inicio: 'ayer' }, { inicio: dia(3), fin: dia(1) },
      { horaDesde: '10:00' }, { horaDesde: '25:00', horaHasta: '26:00' }, { dias: [7] }, { dias: ['lunes'] },
      { montoMinimo: 100 },
    ];
    for (const m of malos) {
      const r = await send(admin, 'post', '/api/promociones', base(m));
      expect(r.status, JSON.stringify(m)).toBe(400);
    }
    await send(ana, 'post', '/api/promociones', base()).expect(403);
    await ana.get('/api/promociones').expect(403);
    await request(app).get('/api/promociones').expect(401);
  });
});

describe('Fase 3 · B11 aplicación en el pedido', () => {
  it('rebaja el plato y deja el detalle en el pedido', async () => {
    const p = await crear();
    const ped = await pedir();
    const desc = Math.round(precio() * 0.1);
    expect(ped).toMatchObject({ subtotal: precio(), descuentoPromo: desc, total: precio() - desc, promocion: { id: p.id, nombre: 'Promo T3' } });
    const fila = await db('pedidos').where({ id: ped.id }).first();
    expect(Number(fila.total)).toBe(precio() - desc);
  });

  it('sin promoción el pedido queda igual', async () => {
    const ped = await pedir();
    expect(ped).toMatchObject({ subtotal: precio(), descuentoPromo: 0, total: precio(), promocion: null });
  });

  it('descuento en pesos por categoría, y también para la mesera', async () => {
    await crear({ alcance: 'categoria', platoId: undefined, categoria: hamb().categoria, tipo: 'monto', valor: 2000 });
    const ped = await pedir({ items: [item(), item()] }, ana);
    expect(ped).toMatchObject({ subtotal: precio() * 2, descuentoPromo: 4000, total: precio() * 2 - 4000 });
  });

  it('al total con monto mínimo', async () => {
    await crear({ alcance: 'total', platoId: undefined, valor: 10, montoMinimo: precio() * 2 });
    expect((await pedir()).descuentoPromo).toBe(0);
    const ped = await pedir({ items: [item(), item()] });
    expect(ped.descuentoPromo).toBe(Math.round(precio() * 2 * 0.1));
  });

  it('aplica solo la mejor, sin acumular', async () => {
    await crear({ nombre: 'Chica', valor: 5 });
    const grande = await crear({ nombre: 'Grande', tipo: 'monto', alcance: 'total', platoId: undefined, valor: 3000 });
    const ped = await pedir();
    expect(ped.descuentoPromo).toBe(Math.max(3000, Math.round(precio() * 0.05)));
    expect(ped.promocion.id).toBe(grande.id);
  });

  it('ignora las que no están vigentes', async () => {
    const ahora = new Date(Date.now() - 5 * 3600e3);
    const h = ahora.getUTCHours();
    const dow = (ahora.getUTCDay() + 6) % 7;
    const hh = n => String((h + n + 24) % 24).padStart(2, '0') + ':00';
    await crear({ nombre: 'apagada', activa: false });
    await crear({ nombre: 'vencida', inicio: dia(-5), fin: dia(-1) });
    await crear({ nombre: 'futura', inicio: dia(1), fin: dia(3) });
    await crear({ nombre: 'otro dia', dias: [(dow + 1) % 7] });
    await crear({ nombre: 'otra hora', horaDesde: hh(2), horaHasta: hh(3) });
    expect((await pedir()).descuentoPromo).toBe(0);
    await crear({ nombre: 'hoy', dias: [dow], horaDesde: hh(-1), horaHasta: hh(1) });
    expect((await pedir()).promocion.nombre).toBe('hoy');
  });

  it('el descuento no pasa del precio y el precio del cliente se ignora', async () => {
    await crear({ tipo: 'monto', valor: 9000000 });
    const ped = await pedir({ total: 1, descuento: 99999 });
    expect(ped).toMatchObject({ descuentoPromo: precio(), total: 0 });
  });

  it('no se aplica a otros platos', async () => {
    await crear();
    const otro = menu.find(p => p.id !== hamb().id);
    const r = await send(await agente(app), 'post', '/api/pedidos', web({ items: [{ platoId: otro.id, varianteId: otro.variantes[0].id }] })).expect(201);
    expect(r.body.pedido.descuentoPromo).toBe(0);
  });
});

describe('Fase 3 · B11 menú, config pública y cotización', () => {
  it('el menú muestra la etiqueta y el precio rebajado', async () => {
    const p = await crear({ valor: 20 });
    const m = (await request(app).get('/api/menu')).body;
    const h = m.find(x => x.id === hamb().id);
    expect(h.promocion).toEqual({ id: p.id, nombre: 'Promo T3', etiqueta: '20% de descuento' });
    for (const v of h.variantes) expect(v.precioPromo).toBe(v.precio - Math.round(v.precio * 0.2));
    const otro = m.find(x => x.id !== hamb().id);
    expect(otro.promocion).toBeNull();
    expect(otro.variantes[0].precioPromo).toBeNull();
  });

  it('la config pública lista las promociones al total vigentes', async () => {
    await crear({ alcance: 'total', platoId: undefined, valor: 7, montoMinimo: 30000 });
    await crear({ nombre: 'oculta', alcance: 'total', platoId: undefined, valor: 7, activa: false });
    const r = (await request(app).get('/api/public/config')).body;
    expect(r.promociones).toEqual([{ id: expect.any(Number), nombre: 'Promo T3', etiqueta: '7% de descuento desde $30.000', montoMinimo: 30000 }]);
  });

  it('POST /api/pedidos/cotizar calcula igual que el pedido y no guarda nada', async () => {
    await crear();
    const antes = (await db('pedidos').count({ n: '*' }).first()).n;
    const c = await agente(app);
    const q = await send(c, 'post', '/api/pedidos/cotizar', web()).expect(200);
    const desc = Math.round(precio() * 0.1);
    expect(q.body).toEqual({
      subtotal: precio(), descuentoPromo: desc, promocion: { id: expect.any(Number), nombre: 'Promo T3' },
      puntosCanjeados: 0, descuentoPuntos: 0, total: precio() - desc,
    });
    expect((await db('pedidos').count({ n: '*' }).first()).n).toBe(antes);
    await send(c, 'post', '/api/pedidos/cotizar', { destino: 'Recoger en local', items: [] }).expect(400);
  });
});
