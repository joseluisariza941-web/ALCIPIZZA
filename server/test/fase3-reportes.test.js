import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { abrirLocal, agente, db, entrarComo, instantanea, send, testApp } from './helpers.js';

const app = testApp();
let restaurar, admin, ana, menu;
const hamb = () => menu.find(p => p.nombre === 'Hamburguesa');
const item = () => ({ platoId: hamb().id, varianteId: hamb().variantes[0].id });
const web = (o = {}) => ({ destino: 'Recoger en local', cliente: 'Juan Facturas', telefono: '3001234567', metodoPago: 'nq', items: [item()], ...o });

beforeAll(async () => {
  restaurar = await instantanea();
  await abrirLocal();
  menu = (await request(app).get('/api/menu')).body;
  admin = await entrarComo(app, 'admin');
  ana = await entrarComo(app, 'ana');
});
afterAll(async () => { await restaurar(); await db.destroy(); });

describe('Fase 3 · B4 facturas', () => {
  let ids = [];
  it('lista las tirillas con paginado, fechas y búsqueda', async () => {
    const c = await agente(app);
    for (let i = 0; i < 3; i++) ids.push((await send(c, 'post', '/api/pedidos', web({ cliente: i === 1 ? 'Zulma Rara' : 'Juan Facturas' })).expect(201)).body.pedido.id);
    ids.push((await send(ana, 'post', '/api/pedidos', { destino: 'Mesa 2', items: [item()] }).expect(201)).body.pedido.id);
    await send(admin, 'patch', `/api/pedidos/${ids[0]}/estado`, { estado: 'cancelado' }).expect(200);

    const r = await admin.get('/api/facturas?porPagina=2').expect(200);
    expect(r.body).toMatchObject({ pagina: 1, porPagina: 2 });
    expect(r.body.total).toBeGreaterThanOrEqual(4);
    expect(r.body.paginas).toBe(Math.ceil(r.body.total / 2));
    expect(r.body.facturas).toHaveLength(2);
    expect(r.body.facturas[0].id).toBeGreaterThan(r.body.facturas[1].id);
    expect(r.body.facturas[0].items.length).toBe(1);
    const p2 = await admin.get('/api/facturas?porPagina=2&pagina=2').expect(200);
    expect(p2.body.facturas[0].id).toBeLessThan(r.body.facturas[1].id);

    const q = await admin.get('/api/facturas?q=Zulma').expect(200);
    expect(q.body.facturas.map(f => f.id)).toEqual([ids[1]]);
    const porId = await admin.get(`/api/facturas?q=${ids[2]}`).expect(200);
    expect(porId.body.facturas.map(f => f.id)).toContain(ids[2]);
    const tel = await admin.get('/api/facturas?q=3001234567').expect(200);
    expect(tel.body.total).toBeGreaterThanOrEqual(3);
    expect((await admin.get('/api/facturas?q=zzzninguno')).body).toMatchObject({ total: 0, facturas: [] });

    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    expect((await admin.get(`/api/facturas?desde=${hoy}&hasta=${hoy}`).expect(200)).body.total).toBeGreaterThanOrEqual(4);
    expect((await admin.get('/api/facturas?desde=2020-01-01&hasta=2020-01-02').expect(200)).body.total).toBe(0);
  });

  it('valida parámetros y permisos', async () => {
    await admin.get('/api/facturas?pagina=0').expect(400);
    await admin.get('/api/facturas?porPagina=500').expect(400);
    await admin.get('/api/facturas?desde=ayer').expect(400);
    await ana.get('/api/facturas').expect(403);
    await request(app).get('/api/facturas').expect(401);
  });
});

describe('Fase 3 · B1 reiniciar reportes', () => {
  it('exige cocina y la palabra BORRAR', async () => {
    await send(ana, 'post', '/api/admin/reiniciar-reportes', { confirmar: 'BORRAR' }).expect(403);
    await send(admin, 'post', '/api/admin/reiniciar-reportes', {}).expect(400);
    await send(admin, 'post', '/api/admin/reiniciar-reportes', { confirmar: 'borrar' }).expect(400);
    expect((await db('pedidos').count({ n: '*' }).first()).n).toBeGreaterThan(0);
  });

  it('borra pedidos, compras y bitácora sin tocar menú, insumos, stock, usuarios ni ajustes', async () => {
    const carne = await db('insumos').where({ nombre: 'Carne' }).first();
    await send(admin, 'post', '/api/compras', { insumoId: carne.id, cantidad: 1, unidad: 'lb', costo: 100 }).expect(201);
    const antes = {
      insumos: await db('insumos').select('id', 'stock', 'stock_referencia', 'costo').orderBy('id'),
      platos: (await db('platos').count({ n: '*' }).first()).n,
      usuarios: (await db('usuarios').count({ n: '*' }).first()).n,
      config: (await db('config').where({ clave: 'general' }).first()).valor,
      metodos: (await db('metodos_pago').count({ n: '*' }).first()).n,
    };
    const r = await send(admin, 'post', '/api/admin/reiniciar-reportes', { confirmar: 'BORRAR' }).expect(200);
    expect(r.body).toMatchObject({ ok: true, pedidos: expect.any(Number), compras: expect.any(Number), bitacora: expect.any(Number) });
    expect(r.body.pedidos).toBeGreaterThan(0);
    for (const t of ['pedidos', 'pedido_items', 'pedido_item_extras', 'compras']) {
      expect((await db(t).count({ n: '*' }).first()).n, t).toBe(0);
    }
    const log = await db('bitacora');
    expect(log).toHaveLength(1);
    expect(log[0].accion).toBe('Reinició los reportes');
    expect(log[0].usuario).toBe('admin');
    expect(await db('insumos').select('id', 'stock', 'stock_referencia', 'costo').orderBy('id')).toEqual(antes.insumos);
    expect((await db('platos').count({ n: '*' }).first()).n).toBe(antes.platos);
    expect((await db('usuarios').count({ n: '*' }).first()).n).toBe(antes.usuarios);
    expect((await db('config').where({ clave: 'general' }).first()).valor).toEqual(antes.config);
    expect((await db('metodos_pago').count({ n: '*' }).first()).n).toBe(antes.metodos);
    const rep = (await admin.get('/api/reportes/ventas').expect(200)).body;
    expect(rep).toMatchObject({ total: 0, pedidos: 0, compras: 0 });
    expect((await admin.get('/api/facturas')).body.total).toBe(0);
  });
});
