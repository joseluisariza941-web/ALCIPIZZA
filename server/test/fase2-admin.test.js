import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { abrirLocal, agente, db, entrarComo, instantanea, send, testApp } from './helpers.js';

const app = testApp();
let restaurar, admin, ana;
const insumoId = async n => (await db('insumos').where({ nombre: n }).first()).id;
const itemCoca = async () => {
  const coca = (await request(app).get('/api/menu')).body.find(p => p.nombre === 'Coca-Cola');
  return { platoId: coca.id, varianteId: coca.variantes[0].id };
};

beforeAll(async () => {
  restaurar = await instantanea();
  await abrirLocal();
  admin = await entrarComo(app, 'admin');
  ana = await entrarComo(app, 'ana');
});
afterAll(async () => { await restaurar(); await db.destroy(); });

describe('Fase 2 · permisos de administración', () => {
  it('solo cocina entra a las rutas de administración', async () => {
    for (const url of ['/api/admin/platos', '/api/admin/extras', '/api/insumos', '/api/surtidores', '/api/compras',
      '/api/config', '/api/metodos-pago', '/api/reportes/ventas']) {
      const res = await ana.get(url);
      expect(res.status, url).toBe(403);
      await request(app).get(url).expect(401);
      await admin.get(url).expect(200);
    }
  });
});

describe('Fase 2 · insumos', () => {
  it('lista, crea, edita y borra insumos', async () => {
    const lista = await admin.get('/api/insumos').expect(200);
    expect(lista.body.find(i => i.nombre === 'Carne')).toEqual({
      id: expect.any(Number), nombre: 'Carne', tipo: 'insumo', unidad: 'lb', stock: 18, stockReferencia: 18, costo: 0, surtidorId: null, ultimaCompra: null,
    });
    const nuevo = await send(admin, 'post', '/api/insumos', { nombre: 'Cebolla', tipo: 'insumo', unidad: 'kg', stock: 2, stockReferencia: 5, costo: 3000 }).expect(201);
    expect(nuevo.body).toMatchObject({ nombre: 'Cebolla', unidad: 'kg', stock: 2, stockReferencia: 5, costo: 3000, surtidorId: null });
    await send(admin, 'post', '/api/insumos', { nombre: 'Cebolla', tipo: 'insumo', unidad: 'kg' }).expect(409);
    await send(admin, 'post', '/api/insumos', { nombre: 'X', tipo: 'insumo', unidad: 'litros' }).expect(400);
    const ed = await send(admin, 'put', `/api/insumos/${nuevo.body.id}`, { stock: 4.5 }).expect(200);
    expect(ed.body).toMatchObject({ nombre: 'Cebolla', stock: 4.5 });
    await send(admin, 'delete', `/api/insumos/${nuevo.body.id}`).expect(200, { ok: true });
    expect((await db('insumos').where({ id: nuevo.body.id }).first()).eliminado_en).toBeTruthy();
    expect((await admin.get('/api/insumos')).body.find(i => i.id === nuevo.body.id)).toBeUndefined();
    await send(admin, 'delete', `/api/insumos/${nuevo.body.id}`).expect(404);
  });

  it('no borra un insumo que usa un plato (409)', async () => {
    const res = await send(admin, 'delete', `/api/insumos/${await insumoId('Carne')}`).expect(409);
    expect(res.body.error).toBeTruthy();
  });
});

describe('Fase 2 · surtidores y compras', () => {
  it('CRUD de surtidores', async () => {
    const s = await send(admin, 'post', '/api/surtidores', { nombre: 'Carnes Don Luis', empresa: 'DL SAS', correo: 'dl@x.co', telefono: '300' }).expect(201);
    expect(s.body).toEqual({ id: expect.any(Number), nombre: 'Carnes Don Luis', empresa: 'DL SAS', correo: 'dl@x.co', telefono: '300' });
    await send(admin, 'post', '/api/surtidores', { nombre: '' }).expect(400);
    const ed = await send(admin, 'put', `/api/surtidores/${s.body.id}`, { telefono: '311' }).expect(200);
    expect(ed.body.telefono).toBe('311');
    expect((await admin.get('/api/surtidores').expect(200)).body.map(x => x.id)).toContain(s.body.id);
    await send(admin, 'delete', `/api/surtidores/${s.body.id}`).expect(200);
    await send(admin, 'put', `/api/surtidores/${s.body.id}`, { telefono: '1' }).expect(404);
  });

  it('una compra suma al stock con conversión de unidades', async () => {
    const sur = (await send(admin, 'post', '/api/surtidores', { nombre: 'Fruver' }).expect(201)).body;
    const antes = await db('insumos').where({ nombre: 'Tomate' }).first(); // en kg
    const res = await send(admin, 'post', '/api/compras', {
      insumoId: antes.id, cantidad: 500, unidad: 'g', costo: 2500, surtidorId: sur.id,
    }).expect(201);
    expect(res.body).toMatchObject({
      insumo: { id: antes.id, nombre: 'Tomate' }, cantidad: 500, unidad: 'g', costo: 2500,
      surtidor: { id: sur.id, nombre: 'Fruver' }, registradoPor: { id: expect.any(Number), nombre: 'Administración cocina' },
    });
    const despues = await db('insumos').where({ id: antes.id }).first();
    expect(Number(despues.stock)).toBeCloseTo(Number(antes.stock) + 0.5, 3);
    expect(Number(despues.costo)).toBe(2500);
    expect(despues.surtidor_id).toBe(sur.id);
    // unidades incompatibles
    await send(admin, 'post', '/api/compras', { insumoId: antes.id, cantidad: 2, unidad: 'und', costo: 0, surtidorId: null }).expect(400);
    await send(admin, 'post', '/api/compras', { insumoId: antes.id, cantidad: 0, unidad: 'kg', costo: 0 }).expect(400);
    // el insumo muestra su última compra (para las columnas "Ingresó / Registró")
    const tomate = (await admin.get('/api/insumos').expect(200)).body.find(i => i.id === antes.id);
    expect(tomate.ultimaCompra).toEqual({ fecha: expect.any(String), cantidad: 500, unidad: 'g', usuario: 'Administración cocina' });
    // un insumo con compras no se borra (las compras no se borran)
    await send(admin, 'delete', `/api/insumos/${antes.id}`).expect(409);
  });

  it('una compra puede crear un insumo nuevo', async () => {
    const res = await send(admin, 'post', '/api/compras', {
      nuevoInsumo: { nombre: 'Aguacate', tipo: 'insumo', unidad: 'und' }, cantidad: 10, unidad: 'und', costo: 15000, surtidorId: null,
    }).expect(201);
    expect(res.body.insumo.nombre).toBe('Aguacate');
    const ins = await db('insumos').where({ nombre: 'Aguacate' }).first();
    expect(Number(ins.stock)).toBe(10);
    await send(admin, 'post', '/api/compras', { cantidad: 1, unidad: 'und', costo: 0 }).expect(400);
  });

  it('lista las compras por rango de fechas', async () => {
    const hoy = await admin.get('/api/compras').expect(200);
    expect(hoy.body.length).toBeGreaterThanOrEqual(2);
    expect(hoy.body[0]).toHaveProperty('fecha');
    const viejo = await admin.get(`/api/compras?desde=2020-01-01T00:00:00Z&hasta=2020-01-02T00:00:00Z`).expect(200);
    expect(viejo.body).toEqual([]);
    // AAAA-MM-DD en hora de Bogotá; "hasta" incluye el día completo
    const dia = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
    const r = await admin.get(`/api/compras?desde=${dia}&hasta=${dia}`).expect(200);
    expect(r.body.length).toBe(hoy.body.length);
    await admin.get('/api/compras?desde=ayer').expect(400);
  });
});

describe('Fase 2 · extras', () => {
  it('CRUD de extras', async () => {
    const lista = await admin.get('/api/admin/extras').expect(200);
    expect(lista.body.find(e => e.nombre === 'Queso extra')).toEqual({
      id: expect.any(Number), nombre: 'Queso extra', insumoId: await insumoId('Queso'), cantidad: 30, unidad: 'g', precio: 2000, grupo: null,
    });
    const e = await send(admin, 'post', '/api/admin/extras', {
      nombre: 'Tocineta', insumoId: null, cantidad: 0, unidad: null, precio: 3000, grupo: null,
    }).expect(201);
    expect(e.body).toMatchObject({ nombre: 'Tocineta', precio: 3000 });
    const ed = await send(admin, 'put', `/api/admin/extras/${e.body.id}`, { precio: 3500, grupo: 'carnes' }).expect(200);
    expect(ed.body).toMatchObject({ precio: 3500, grupo: 'carnes' });
    await send(admin, 'post', '/api/admin/extras', { nombre: 'Malo', precio: -1 }).expect(400);
    await send(admin, 'delete', `/api/admin/extras/${e.body.id}`).expect(200);
  });
});

describe('Fase 2 · platos', () => {
  let creado;
  it('GET /api/admin/platos incluye inactivos, ingredientes con cantidad y multiplicadores', async () => {
    await db('platos').where({ nombre: 'Pepsi' }).update({ activo: false });
    const res = await admin.get('/api/admin/platos').expect(200);
    expect(res.body.find(p => p.nombre === 'Pepsi').activo).toBe(false);
    const pizza = res.body.find(p => p.nombre === 'Pizza');
    expect(pizza.variantes[0]).toEqual({ id: expect.any(Number), nombre: 'Porción', precio: 6000, multiplicador: 0.15 });
    expect(pizza.ingredientes).toContainEqual({ insumoId: await insumoId('Masa pizza'), nombre: 'Masa pizza', cantidad: 300, unidad: 'g' });
    expect(pizza.salsas).toContainEqual({ insumoId: await insumoId('Ketchup'), nombre: 'Ketchup' });
    await db('platos').where({ nombre: 'Pepsi' }).update({ activo: true });
  });

  it('crea un plato (y su categoría si no existe)', async () => {
    const queso = await db('extras').where({ nombre: 'Queso extra' }).first();
    const res = await send(admin, 'post', '/api/admin/platos', {
      nombre: 'Burrito', emoji: '🌯', imagenUrl: '', categoria: 'Mexicana', activo: true,
      variantes: [{ nombre: 'Normal', precio: 15000, multiplicador: 1 }, { nombre: 'Grande', precio: 20000, multiplicador: 1.5 }],
      ingredientes: [{ insumoId: await insumoId('Tortilla'), cantidad: 1, unidad: null }, { insumoId: await insumoId('Carne'), cantidad: 100, unidad: 'g' }],
      salsas: [await insumoId('Ají')], extras: [queso.id],
    }).expect(201);
    creado = res.body;
    expect(creado).toMatchObject({ nombre: 'Burrito', categoria: 'Mexicana', activo: true, imagenUrl: null });
    expect(creado.variantes.map(v => v.precio)).toEqual([15000, 20000]);
    expect(creado.ingredientes.map(i => i.nombre)).toEqual(['Carne', 'Tortilla']);
    expect(creado.salsas.map(s => s.nombre)).toEqual(['Ají']);
    expect(creado.extras.map(e => e.nombre)).toEqual(['Queso extra']);
    const menu = (await request(app).get('/api/menu')).body;
    expect(menu.find(p => p.nombre === 'Burrito').categoria).toBe('Mexicana');
  });

  it('valida el plato', async () => {
    await send(admin, 'post', '/api/admin/platos', { nombre: 'Sin variantes', categoria: 'X', variantes: [] }).expect(400);
    await send(admin, 'post', '/api/admin/platos', {
      nombre: 'Con insumo malo', categoria: 'X', variantes: [{ nombre: 'U', precio: 1 }], ingredientes: [{ insumoId: 999999, cantidad: 1 }],
    }).expect(400);
  });

  it('edita un plato conservando el id de las variantes que se mantienen', async () => {
    const [normal] = creado.variantes;
    const res = await send(admin, 'put', `/api/admin/platos/${creado.id}`, {
      nombre: 'Burrito XL', emoji: '🌯', categoria: 'Mexicana', activo: true,
      variantes: [{ id: normal.id, nombre: 'Normal', precio: 16000, multiplicador: 1 }, { nombre: 'Familiar', precio: 30000, multiplicador: 2 }],
      ingredientes: [{ insumoId: await insumoId('Tortilla'), cantidad: 2, unidad: null }], salsas: [], extras: [],
    }).expect(200);
    expect(res.body.nombre).toBe('Burrito XL');
    expect(res.body.variantes).toEqual([
      { id: normal.id, nombre: 'Normal', precio: 16000, multiplicador: 1 },
      { id: expect.any(Number), nombre: 'Familiar', precio: 30000, multiplicador: 2 },
    ]);
    expect(res.body.ingredientes).toEqual([{ insumoId: await insumoId('Tortilla'), nombre: 'Tortilla', cantidad: 2, unidad: null }]);
    expect(res.body.salsas).toEqual([]);
    await send(admin, 'put', '/api/admin/platos/999999', res.body).expect(404);
  });

  it('borrar un plato lo oculta sin borrarlo ni cambiar su activo', async () => {
    const cliente = await agente(app);
    await send(cliente, 'post', '/api/pedidos', {
      destino: 'Recoger en local', cliente: 'Eva', telefono: '300', metodoPago: 'ef',
      items: [{ platoId: creado.id, varianteId: creado.variantes[0].id }],
    }).expect(201);
    await send(admin, 'delete', `/api/admin/platos/${creado.id}`).expect(200, { ok: true });
    const fila = await db('platos').where({ id: creado.id }).first();
    expect(fila.eliminado_en).toBeTruthy();
    expect(Number(fila.activo)).toBe(1);
    expect((await admin.get('/api/admin/platos')).body.find(p => p.id === creado.id)).toBeUndefined();
    expect((await admin.get('/api/admin/platos?eliminados=1')).body.find(p => p.id === creado.id).eliminadoEn).toEqual(expect.any(String));
    const otro = (await send(admin, 'post', '/api/admin/platos', {
      nombre: 'Temporal', categoria: 'Mexicana', variantes: [{ nombre: 'U', precio: 1000 }],
    }).expect(201)).body;
    await send(admin, 'delete', `/api/admin/platos/${otro.id}`).expect(200, { ok: true });
    expect((await db('platos').where({ id: otro.id }).first()).eliminado_en).toBeTruthy();
    await send(admin, 'delete', `/api/admin/platos/${otro.id}`).expect(404);
  });
});

describe('Fase 2 · ajustes', () => {
  it('lee y actualiza la configuración parcialmente', async () => {
    const res = await admin.get('/api/config').expect(200);
    expect(res.body).toMatchObject({ n: 'Alcipizza', mesas: 8 });
    const h = [[17, 23], [17, 23], null, [17, 23], [17, 23], [12, 23.5], [12, 22]];
    const ed = await send(admin, 'put', '/api/config', { n: 'Alcipizza Güepsa', mesas: 10, h }).expect(200);
    expect(ed.body).toMatchObject({ n: 'Alcipizza Güepsa', mesas: 10, h, tel: '3108819617' });
    expect((await request(app).get('/api/public/config')).body.config.n).toBe('Alcipizza Güepsa');
    await send(admin, 'put', '/api/config', { h: [[1, 2]] }).expect(400);
    await send(admin, 'put', '/api/config', { mesas: -1 }).expect(400);
    await send(admin, 'put', '/api/config', { h: Array(7).fill([10, 30]) }).expect(400);
  });

  it('lee y actualiza los métodos de pago', async () => {
    const res = await admin.get('/api/metodos-pago').expect(200);
    expect(res.body).toHaveLength(5);
    const ed = await send(admin, 'put', '/api/metodos-pago/nq', { nombre: 'Nequi', numero: '3001112233', activo: false }).expect(200);
    expect(ed.body).toEqual({ codigo: 'nq', nombre: 'Nequi', numero: '3001112233', activo: false, qrUrl: null });
    const pub = (await request(app).get('/api/public/config')).body.pagos.map(p => p.codigo);
    expect(pub).not.toContain('nq');
    await send(admin, 'put', '/api/metodos-pago/zz', { nombre: 'Z', numero: '', activo: true }).expect(404);
    await send(admin, 'put', '/api/metodos-pago/nq', { nombre: 'Nequi', numero: '3001112233', activo: true }).expect(200);
  });

  it('crea y borra métodos de pago (si ya se usó, solo se desactiva)', async () => {
    const nuevo = await send(admin, 'post', '/api/metodos-pago', { nombre: 'Movii', numero: '3110000000', activo: true }).expect(201);
    expect(nuevo.body).toEqual({ codigo: expect.stringMatching(/^[a-z0-9]{1,10}$/), nombre: 'Movii', numero: '3110000000', activo: true, qrUrl: null });
    await send(admin, 'post', '/api/metodos-pago', { nombre: 'movii' }).expect(409);
    await send(admin, 'post', '/api/metodos-pago', { nombre: '' }).expect(400);
    await send(ana, 'post', '/api/metodos-pago', { nombre: 'Otro' }).expect(403);
    expect((await request(app).get('/api/public/config')).body.pagos.map(p => p.codigo)).toContain(nuevo.body.codigo);
    await send(admin, 'delete', `/api/metodos-pago/${nuevo.body.codigo}`).expect(200, { ok: true });
    expect((await db('metodos_pago').where({ codigo: nuevo.body.codigo }).first()).eliminado_en).toBeTruthy();
    expect((await admin.get('/api/metodos-pago')).body.map(x => x.codigo)).not.toContain(nuevo.body.codigo);
    expect((await admin.get('/api/metodos-pago?eliminados=1')).body.find(x => x.codigo === nuevo.body.codigo).eliminadoEn).toEqual(expect.any(String));
    await send(admin, 'delete', `/api/metodos-pago/${nuevo.body.codigo}`).expect(404);
    // uno usado en un pedido se desactiva para no perder el historial
    const usado = (await send(admin, 'post', '/api/metodos-pago', { nombre: 'Bold' }).expect(201)).body;
    const p = (await send(ana, 'post', '/api/pedidos', { destino: 'Mesa 1', items: [await itemCoca()] }).expect(201)).body.pedido;
    await send(ana, 'post', `/api/pedidos/${p.id}/pago`, { metodoPago: usado.codigo }).expect(200);
    await send(admin, 'delete', `/api/metodos-pago/${usado.codigo}`).expect(200, { ok: true });
    const eliminado = await db('metodos_pago').where({ codigo: usado.codigo }).first();
    expect(eliminado.eliminado_en).toBeTruthy();
    expect(Number(eliminado.activo)).toBe(1);
  });
});

describe('Fase 2 · reportes', () => {
  it('resume las ventas del rango sin contar cancelados', async () => {
    await abrirLocal(); // "ajustes" deja un horario 17–23: sin esto falla según la hora del día
    await db('pedidos').del();
    await db('compras').del();
    const cliente = await agente(app);
    const menu = (await request(app).get('/api/menu')).body;
    const pizza = menu.find(p => p.nombre === 'Pizza');
    const coca = menu.find(p => p.nombre === 'Coca-Cola');
    const crear = async items => (await send(ana, 'post', '/api/pedidos', { destino: 'Mesa 1', items }).expect(201)).body.pedido;
    const p1 = await crear([{ platoId: pizza.id, varianteId: pizza.variantes[2].id }, { platoId: coca.id, varianteId: coca.variantes[0].id }]);
    const p2 = await crear([{ platoId: pizza.id, varianteId: pizza.variantes[2].id }]);
    const p3 = await crear([{ platoId: coca.id, varianteId: coca.variantes[0].id }]);
    await send(ana, 'post', `/api/pedidos/${p1.id}/pago`, { metodoPago: 'ef' }).expect(200);
    await send(ana, 'post', `/api/pedidos/${p2.id}/pago`, { metodoPago: 'nq' }).expect(200);
    await send(admin, 'patch', `/api/pedidos/${p3.id}/estado`, { estado: 'cancelado' }).expect(200);
    await send(admin, 'post', '/api/compras', { insumoId: await insumoId('Pan'), cantidad: 10, unidad: 'und', costo: 8000 }).expect(201);
    // un pedido web sin cobrar
    await send(cliente, 'post', '/api/pedidos', {
      destino: 'Recoger en local', cliente: 'Eva', telefono: '300', metodoPago: 'ef', items: [{ platoId: coca.id, varianteId: coca.variantes[0].id }],
    }).expect(201);

    const res = await admin.get('/api/reportes/ventas').expect(200);
    expect(res.body.total).toBe(28000 + 2000 + 28000 + 2000);
    expect(res.body.pedidos).toBe(3);
    expect(res.body.porPlato).toEqual([
      { nombre: 'Pizza', cantidad: 2, total: 56000 },
      { nombre: 'Coca-Cola', cantidad: 2, total: 4000 },
    ]);
    expect(res.body.porMetodo).toEqual(expect.arrayContaining([{ metodo: 'Efectivo', total: 32000 }, { metodo: 'Nequi', total: 28000 }]));
    expect(res.body.porDia).toHaveLength(1);
    expect(res.body.porDia[0]).toEqual({ fecha: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), total: 60000 });
    expect(res.body.compras).toBe(8000);
    expect(res.body).toMatchObject({ cobrado: 58000, porCobrar: 2000, comprasWeb: 1 });
    // rango en AAAA-MM-DD (hora de Bogotá), "hasta" inclusivo
    const dia = res.body.porDia[0].fecha;
    expect((await admin.get(`/api/reportes/ventas?desde=${dia}&hasta=${dia}`).expect(200)).body.total).toBe(60000);
    const viejo = (await admin.get('/api/reportes/ventas?desde=2020-01-01&hasta=2020-01-31').expect(200)).body;
    expect(viejo).toMatchObject({ total: 0, pedidos: 0, cobrado: 0, porCobrar: 0, comprasWeb: 0, compras: 0, porDia: [] });
  });
});
