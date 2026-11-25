import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, entrarComo, instantanea, send, testApp } from './helpers.js';

const app = testApp();
let restaurar, admin;
const insumoId = async n => (await db('insumos').where({ nombre: n }).first()).id;
const stock = async id => Number((await db('insumos').where({ id }).first()).stock);

beforeAll(async () => {
  restaurar = await instantanea();
  admin = await entrarComo(app, 'admin');
});
afterAll(async () => {
  await restaurar();
  await db('insumos').whereIn('nombre', ['T3 Harina', 'T3 Aceite', 'T3 Aceite ml', 'T3 Leche', 'T3 Sal']).del();
  await db.destroy();
});

describe('Fase 3 · A2 borrar compras', () => {
  it('borra la compra y descuenta lo que sumó del stock', async () => {
    const ins = (await send(admin, 'post', '/api/insumos', { nombre: 'T3 Harina', unidad: 'kg', stock: 1, stockReferencia: 1 }).expect(201)).body;
    const c = (await send(admin, 'post', '/api/compras', { insumoId: ins.id, cantidad: 2000, unidad: 'g', costo: 5000 }).expect(201)).body;
    expect(await stock(ins.id)).toBe(3);
    await send(admin, 'delete', `/api/compras/${c.id}`).expect(200, { ok: true });
    expect(await stock(ins.id)).toBe(1);
    expect(Number((await db('insumos').where({ id: ins.id }).first()).stock_referencia)).toBe(1);
    expect(await db('compras').where({ id: c.id }).first()).toBeUndefined();
    const log = await db('bitacora').orderBy('id', 'desc').first();
    expect(log.accion).toContain('T3 Harina');
    await send(admin, 'delete', `/api/compras/${c.id}`).expect(404);
  });

  it('el stock no baja de 0', async () => {
    const ins = (await send(admin, 'post', '/api/insumos', { nombre: 'T3 Aceite', unidad: 'L', stock: 0 }).expect(201)).body;
    const c = (await send(admin, 'post', '/api/compras', { insumoId: ins.id, cantidad: 5, unidad: 'L', costo: 1 }).expect(201)).body;
    await db('insumos').where({ id: ins.id }).update({ stock: 2 });
    await send(admin, 'delete', `/api/compras/${c.id}`).expect(200);
    expect(await stock(ins.id)).toBe(0);
  });

  it('pide rol cocina', async () => {
    const ana = await entrarComo(app, 'ana');
    await send(ana, 'delete', '/api/compras/1').expect(403);
  });
});

describe('Fase 3 · A3 borrar insumos', () => {
  it('con compras lo desactiva y lo oculta de la lista', async () => {
    const ins = (await send(admin, 'post', '/api/insumos', { nombre: 'T3 Leche', unidad: 'L' }).expect(201)).body;
    await send(admin, 'post', '/api/compras', { insumoId: ins.id, cantidad: 3, unidad: 'L', costo: 9000 }).expect(201);
    const res = await send(admin, 'delete', `/api/insumos/${ins.id}`).expect(200);
    expect(res.body).toEqual({ ok: true, desactivado: true });
    expect((await admin.get('/api/insumos')).body.find(i => i.id === ins.id)).toBeUndefined();
    expect((await db('insumos').where({ id: ins.id }).first()).activo).toBeFalsy();
    await send(admin, 'post', '/api/compras', { insumoId: ins.id, cantidad: 1, unidad: 'L' }).expect(400);
  });

  it('sin compras lo borra de verdad', async () => {
    const ins = (await send(admin, 'post', '/api/insumos', { nombre: 'T3 Sal', unidad: 'kg' }).expect(201)).body;
    const res = await send(admin, 'delete', `/api/insumos/${ins.id}`).expect(200);
    expect(res.body).toEqual({ ok: true, desactivado: false });
    expect(await db('insumos').where({ id: ins.id }).first()).toBeUndefined();
  });

  it('usado por platos: 409 con todos los nombres', async () => {
    const id = await insumoId('Carne');
    const usados = (await db('plato_ingredientes as pi').join('platos as p', 'p.id', 'pi.plato_id').where('pi.insumo_id', id).select('p.nombre', 'p.id'));
    const res = await send(admin, 'delete', `/api/insumos/${id}`).expect(409);
    for (const u of usados) expect(res.body.error).toContain(u.nombre);
    expect(res.body.code).toBe('EN_USO');
    expect(res.body.detalles.map(d => d.platoId).sort()).toEqual(usados.map(u => u.id).sort());
  });
});

describe('Fase 3 · B2 unidades', () => {
  it('acepta ml y L; convierte dentro del grupo y no entre grupos', async () => {
    const ins = (await send(admin, 'post', '/api/insumos', { nombre: 'T3 Aceite ml', unidad: 'ml', stock: 0 }).expect(201)).body;
    await send(admin, 'post', '/api/compras', { insumoId: ins.id, cantidad: 2, unidad: 'L', costo: 1 }).expect(201);
    expect(await stock(ins.id)).toBe(2000);
    await send(admin, 'post', '/api/compras', { insumoId: ins.id, cantidad: 1, unidad: 'kg', costo: 1 }).expect(400);
    await send(admin, 'post', '/api/compras', { insumoId: ins.id, cantidad: 1, unidad: 'und', costo: 1 }).expect(400);
    const masa = (await send(admin, 'post', '/api/insumos', { nombre: 'T3 Sal', unidad: 'g', stock: 0 }).expect(201)).body;
    await send(admin, 'post', '/api/compras', { insumoId: masa.id, cantidad: 1, unidad: 'L', costo: 1 }).expect(400);
    await send(admin, 'post', '/api/compras', { insumoId: masa.id, cantidad: 1, unidad: 'lb', costo: 1 }).expect(201);
    expect(await stock(masa.id)).toBeCloseTo(453.592, 2);
  });
});
