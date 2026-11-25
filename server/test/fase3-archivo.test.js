import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { abrirLocal, agente, db, entrar, entrarComo, instantanea, prepararUsuario, send, testApp } from './helpers.js';

const app = testApp();
let restaurar, admin, ana, menu;
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const dia = (delta = 0) => new Date(Date.now() - 5 * 3600e3 + delta * 86400e3).toISOString().slice(0, 10);
const item = () => ({ platoId: menu.find(p => p.nombre === 'Hamburguesa').id, varianteId: menu.find(p => p.nombre === 'Hamburguesa').variantes[0].id });
const web = (o = {}) => ({ destino: 'Recoger en local', cliente: 'Archivo', telefono: '3001234567', metodoPago: 'ef', items: [item()], ...o });
const mesa = (a = ana, o = {}) => send(a, 'post', '/api/pedidos', { destino: 'Mesa 3', items: [item()], ...o }).expect(201);
const crearPlato = async (nombre, o = {}) => (await send(admin, 'post', '/api/admin/platos', {
  nombre, categoria: 'Archivo', variantes: [{ nombre: 'U', precio: 1000 }], ...o,
}).expect(201)).body;
const crearInsumo = async (nombre, o = {}) => (await send(admin, 'post', '/api/insumos', { nombre, unidad: 'und', ...o }).expect(201)).body;
const crearExtra = async (nombre, o = {}) => (await send(admin, 'post', '/api/admin/extras', { nombre, precio: 100, ...o }).expect(201)).body;
const crearSurtidor = async nombre => (await send(admin, 'post', '/api/surtidores', { nombre }).expect(201)).body;
const crearPromo = async (o = {}) => (await send(admin, 'post', '/api/promociones', {
  nombre: 'Promo Archivo', tipo: 'porcentaje', alcance: 'total', valor: 10, inicio: dia(-1), fin: dia(1), ...o,
}).expect(201)).body;
const ids = async tabla => (await db(tabla).select('id')).map(f => f.id);

beforeAll(async () => {
  restaurar = await instantanea();
  await abrirLocal();
  menu = (await request(app).get('/api/menu')).body;
  admin = await entrarComo(app, 'admin');
  ana = await entrarComo(app, 'ana');
});
afterAll(async () => { await restaurar(); await db.destroy(); });

describe('Archivo · platos y extras', () => {
  it('eliminar un plato lo oculta sin borrarlo ni tocar activo, y se puede restaurar', async () => {
    const plato = await crearPlato('A-Plato', { activo: false });
    const res = await send(admin, 'delete', `/api/admin/platos/${plato.id}`).expect(200);
    expect(res.body).toEqual({ ok: true });
    const fila = await db('platos').where({ id: plato.id }).first();
    expect(fila.eliminado_en).toBeTruthy();
    expect(Number(fila.activo)).toBe(0);
    expect((await admin.get('/api/admin/platos')).body.map(p => p.id)).not.toContain(plato.id);
    expect((await request(app).get('/api/menu')).body.map(p => p.id)).not.toContain(plato.id);
    const ocultos = (await admin.get('/api/admin/platos?eliminados=1')).body;
    expect(ocultos.map(p => p.id)).toContain(plato.id);
    expect(ocultos.find(p => p.id === plato.id).eliminadoEn).toEqual(expect.any(String));
    await send(admin, 'put', `/api/admin/platos/${plato.id}`, { nombre: 'No editable' }).expect(404);
    await send(admin, 'post', `/api/admin/platos/${plato.id}/restaurar`).expect(200);
    expect((await admin.get('/api/admin/platos')).body.map(p => p.id)).toContain(plato.id);
    expect((await db('platos').where({ id: plato.id }).first()).eliminado_en).toBeNull();
    await send(admin, 'post', `/api/admin/platos/${plato.id}/restaurar`).expect(404);
  });

  it('conserva los nombres de los pedidos anteriores al eliminar plato y extra', async () => {
    const extra = await crearExtra('A-Extra');
    const plato = await crearPlato('A-ConExtra', { extras: [extra.id] });
    const ped = (await mesa(ana, { items: [{ platoId: plato.id, varianteId: plato.variantes[0].id, extras: [extra.id] }] })).body.pedido;
    await send(admin, 'delete', `/api/admin/extras/${extra.id}`).expect(200);
    await send(admin, 'delete', `/api/admin/platos/${plato.id}`).expect(200);
    const detalle = await admin.get(`/api/pedidos/${ped.id}`).expect(200);
    expect(detalle.body.items[0].nombre).toBe('A-ConExtra');
    expect(detalle.body.items[0].extras[0]).toMatchObject({ nombre: 'A-Extra' });
  });

  it('el extra eliminado no sale en listas ni se puede usar en pedidos nuevos', async () => {
    const extra = await crearExtra('A-ExtraOculto');
    await send(admin, 'delete', `/api/admin/extras/${extra.id}`).expect(200);
    expect((await admin.get('/api/admin/extras')).body.map(e => e.id)).not.toContain(extra.id);
    const ocultos = (await admin.get('/api/admin/extras?eliminados=1')).body;
    expect(ocultos.find(e => e.id === extra.id).eliminadoEn).toEqual(expect.any(String));
    await send(admin, 'put', `/api/admin/extras/${extra.id}`, { precio: 1 }).expect(404);
    await send(ana, 'post', '/api/pedidos', mesaBody(extra.id)).expect(400);
    await send(admin, 'post', `/api/admin/extras/${extra.id}/restaurar`).expect(200);
    expect((await admin.get('/api/admin/extras')).body.map(e => e.id)).toContain(extra.id);
  });

  it('crear un extra con el nombre de uno eliminado lo restaura en vez de crear otro', async () => {
    const extra = await crearExtra('A-ExtraReutilizado');
    const antes = (await db('extras').where({ nombre: 'A-ExtraReutilizado' }).count({ n: '*' }).first()).n;
    await send(admin, 'delete', `/api/admin/extras/${extra.id}`).expect(200);
    const res = await send(admin, 'post', '/api/admin/extras', { nombre: 'A-ExtraReutilizado', precio: 999 }).expect(201);
    expect(res.body.id).toBe(extra.id);
    expect(res.body.precio).toBe(999);
    expect((await db('extras').where({ nombre: 'A-ExtraReutilizado' }).count({ n: '*' }).first()).n).toBe(antes);
    expect((await db('extras').where({ id: extra.id }).first()).eliminado_en).toBeNull();
  });
});

function mesaBody(extraId) {
  return { destino: 'Mesa 3', items: [{ platoId: menu.find(p => p.nombre === 'Hamburguesa').id,
    varianteId: menu.find(p => p.nombre === 'Hamburguesa').variantes[0].id, extras: [extraId] }] };
}

describe('Archivo · insumos', () => {
  it('elimina con compras sin borrar, oculta de listas y selectores, y restaura', async () => {
    const ins = await crearInsumo('A-InsumoCompras');
    await send(admin, 'post', '/api/compras', { insumoId: ins.id, cantidad: 2, unidad: 'und', costo: 100 }).expect(201);
    const res = await send(admin, 'delete', `/api/insumos/${ins.id}`).expect(200);
    expect(res.body).toEqual({ ok: true });
    const fila = await db('insumos').where({ id: ins.id }).first();
    expect(fila.eliminado_en).toBeTruthy();
    expect(fila).not.toHaveProperty('activo');
    expect((await admin.get('/api/insumos')).body.map(i => i.id)).not.toContain(ins.id);
    expect((await admin.get('/api/insumos?eliminados=1')).body.find(i => i.id === ins.id).eliminadoEn).toEqual(expect.any(String));
    expect((await db('bitacora').orderBy('id', 'desc').first()).accion).toContain('Eliminó el insumo A-InsumoCompras');
    await send(admin, 'post', '/api/compras', { insumoId: ins.id, cantidad: 1, unidad: 'und' }).expect(400);
    await send(admin, 'put', `/api/insumos/${ins.id}`, { stock: 9 }).expect(404);
    await send(admin, 'post', `/api/insumos/${ins.id}/restaurar`).expect(200);
    await send(admin, 'post', '/api/compras', { insumoId: ins.id, cantidad: 1, unidad: 'und' }).expect(201);
  });

  it('sin ?forzar=1 bloquea con EN_USO y con forzar quita la receta y lo oculta', async () => {
    const ins = await crearInsumo('A-InsumoReceta');
    const plato = await crearPlato('A-PlatoReceta', { ingredientes: [{ insumoId: ins.id, cantidad: 1 }] });
    const res = await send(admin, 'delete', `/api/insumos/${ins.id}`).expect(409);
    expect(res.body).toMatchObject({ code: 'EN_USO' });
    expect(res.body.detalles).toEqual([{ platoId: plato.id, plato: 'A-PlatoReceta' }]);
    expect(res.body.error).toContain('A-PlatoReceta');
    await send(admin, 'delete', `/api/insumos/${ins.id}?forzar=1`).expect(200);
    expect(await db('plato_ingredientes').where({ insumo_id: ins.id })).toEqual([]);
    expect((await db('insumos').where({ id: ins.id }).first()).eliminado_en).toBeTruthy();
    const acciones = (await db('bitacora').orderBy('id', 'desc').limit(2)).map(f => f.accion);
    expect(acciones.join(' | ')).toContain('A-PlatoReceta');
    expect(acciones.join(' | ')).toContain('Eliminó el insumo A-InsumoReceta');
    expect((await request(app).get('/api/menu')).body.find(p => p.id === plato.id).ingredientes).toEqual([]);
    await send(ana, 'post', '/api/pedidos', { destino: 'Mesa 3', items: [{ platoId: plato.id, varianteId: plato.variantes[0].id,
      sin: ['A-InsumoReceta'] }] }).expect(400);
    await send(admin, 'post', `/api/insumos/${ins.id}/restaurar`).expect(200);
  });

  it('crear un insumo con nombre de uno eliminado lo restaura (también desde una compra)', async () => {
    const ins = await crearInsumo('A-InsumoReutilizado');
    await send(admin, 'delete', `/api/insumos/${ins.id}`).expect(200);
    const res = await send(admin, 'post', '/api/insumos', { nombre: 'A-InsumoReutilizado', unidad: 'kg', stock: 7 }).expect(201);
    expect(res.body.id).toBe(ins.id);
    expect(res.body.unidad).toBe('kg');
    expect(res.body.stock).toBe(7);
    const otra = await crearInsumo('A-InsumoCompraReutilizado');
    await send(admin, 'delete', `/api/insumos/${otra.id}`).expect(200);
    const c = await send(admin, 'post', '/api/compras', { nuevoInsumo: { nombre: 'A-InsumoCompraReutilizado', unidad: 'und' },
      cantidad: 3, unidad: 'und', costo: 10 }).expect(201);
    expect(c.body.insumo.id).toBe(otra.id);
    expect(Number((await db('insumos').where({ id: otra.id }).first()).stock)).toBe(3);
    expect((await db('insumos').where({ id: otra.id }).first()).eliminado_en).toBeNull();
  });

  it('un plato eliminado no admite promociones nuevas', async () => {
    const plato = await crearPlato('A-PlatoSinPromo');
    await send(admin, 'delete', `/api/admin/platos/${plato.id}`).expect(200);
    await send(admin, 'post', '/api/promociones', { nombre: 'Promo borrada', tipo: 'porcentaje', alcance: 'plato',
      platoId: plato.id, valor: 10, inicio: dia(-1), fin: dia(1) }).expect(400);
  });
});

describe('Archivo · surtidores, promociones y métodos de pago', () => {
  it('el surtidor eliminado se oculta, se puede listar, restaurar y reutilizar su nombre', async () => {
    const sur = await crearSurtidor('A-Surtidor');
    await send(admin, 'delete', `/api/surtidores/${sur.id}`).expect(200);
    expect((await admin.get('/api/surtidores')).body.map(s => s.id)).not.toContain(sur.id);
    expect((await admin.get('/api/surtidores?eliminados=1')).body.find(s => s.id === sur.id).eliminadoEn).toEqual(expect.any(String));
    await send(admin, 'put', `/api/surtidores/${sur.id}`, { nombre: 'No editable' }).expect(404);
    const res = await send(admin, 'post', '/api/surtidores', { nombre: 'A-Surtidor', empresa: 'Nueva' }).expect(201);
    expect(res.body.id).toBe(sur.id);
    expect(res.body.empresa).toBe('Nueva');
    expect((await db('surtidores').where({ id: sur.id }).first()).eliminado_en).toBeNull();
    await send(admin, 'post', `/api/surtidores/${sur.id}/restaurar`).expect(404);
  });

  it('la promoción eliminada no aplica, se oculta y se restaura', async () => {
    const p = await crearPromo({ nombre: 'A-Promo' });
    const antes = (await send(await agente(app), 'post', '/api/pedidos/cotizar', web())).body;
    expect(antes.descuentoPromo).toBeGreaterThan(0);
    await send(admin, 'delete', `/api/promociones/${p.id}`).expect(200);
    expect((await admin.get('/api/promociones')).body.map(x => x.id)).not.toContain(p.id);
    expect((await admin.get('/api/promociones?eliminados=1')).body.find(x => x.id === p.id).eliminadoEn).toEqual(expect.any(String));
    expect((await request(app).get('/api/public/config')).body.promociones.map(x => x.id)).not.toContain(p.id);
    const despues = (await send(await agente(app), 'post', '/api/pedidos/cotizar', web())).body;
    expect(despues.descuentoPromo).toBe(0);
    await send(admin, 'put', `/api/promociones/${p.id}`, { valor: 5 }).expect(404);
    await send(admin, 'post', `/api/promociones/${p.id}/restaurar`).expect(200);
    expect((await admin.get('/api/promociones')).body.map(x => x.id)).toContain(p.id);
  });

  it('el método de pago eliminado no se usa ni aparece, pero conserva el historial y activo', async () => {
    const m = (await send(admin, 'post', '/api/metodos-pago', { nombre: 'A-Metodo', activo: true }).expect(201)).body;
    const ped = (await send(await agente(app), 'post', '/api/pedidos', web({ metodoPago: m.codigo })).expect(201)).body.pedido;
    await send(admin, 'delete', `/api/metodos-pago/${m.codigo}`).expect(200);
    const fila = await db('metodos_pago').where({ codigo: m.codigo }).first();
    expect(fila.eliminado_en).toBeTruthy();
    expect(Number(fila.activo)).toBe(1);
    expect((await admin.get('/api/metodos-pago')).body.map(x => x.codigo)).not.toContain(m.codigo);
    expect((await request(app).get('/api/public/config')).body.pagos.map(x => x.codigo)).not.toContain(m.codigo);
    expect((await admin.get('/api/metodos-pago?eliminados=1')).body.find(x => x.codigo === m.codigo).eliminadoEn).toEqual(expect.any(String));
    expect((await admin.get(`/api/pedidos/${ped.id}`)).body.metodoPago.nombre).toBe('A-Metodo');
    await send(await agente(app), 'post', '/api/pedidos', web({ metodoPago: m.codigo })).expect(400);
    await send(admin, 'put', `/api/metodos-pago/${m.codigo}`, { activo: false }).expect(404);
    await send(admin, 'post', `/api/metodos-pago/${m.codigo}/restaurar`).expect(200);
    expect((await admin.get('/api/metodos-pago')).body.map(x => x.codigo)).toContain(m.codigo);
  });
});

describe('Archivo · usuarios', () => {
  it('el usuario eliminado no entra, cierra sesiones, reserva su nombre y se restaura', async () => {
    const creado = (await send(admin, 'post', '/api/usuarios', { usuario: 'archivo1', nombre: 'Borrada',
      clave: 'Archivo-2026', rol: 'mesera' }).expect(201)).body;
    const sesion = await entrar(app, 'archivo1', 'Archivo-2026');
    await send(admin, 'delete', `/api/usuarios/${creado.id}`).expect(200);
    expect((await db('usuarios').where({ id: creado.id }).first()).eliminado_en).toBeTruthy();
    expect((await admin.get('/api/usuarios')).body.map(u => u.id)).not.toContain(creado.id);
    expect((await admin.get('/api/usuarios?eliminados=1')).body.find(u => u.id === creado.id).eliminadoEn).toEqual(expect.any(String));
    await sesion.get('/api/auth/me').expect(401);
    const invitado = await agente(app);
    await send(invitado, 'post', '/api/auth/login', { usuario: 'archivo1', clave: 'Archivo-2026' }).expect(401);
    await send(admin, 'post', '/api/usuarios', { usuario: 'archivo1', nombre: 'Otra', clave: 'Archivo-2026', rol: 'mesera' }).expect(409);
    await send(admin, 'put', `/api/usuarios/${creado.id}`, { nombre: 'No editable' }).expect(404);
    await send(admin, 'post', `/api/usuarios/${creado.id}/restaurar`).expect(200);
    const reingreso = await send(invitado, 'post', '/api/auth/login', { usuario: 'archivo1', clave: 'Archivo-2026' }).expect(200);
    expect(reingreso.body.user.debeCambiarClave).toBe(true);
    invitado.csrf = (await invitado.get('/api/auth/csrf').expect(200)).body.csrfToken;
    const pendiente = await send(invitado, 'put', '/api/auth/perfil', { usuario: 'archivo1' }).expect(403);
    expect(pendiente.body.code).toBe('CAMBIAR_CLAVE');
  });

  it('un usuario con eliminado_en no puede iniciar sesión', async () => {
    await prepararUsuario('ana', 'Ana-Prueba-123');
    const id = (await db('usuarios').where({ usuario: 'ana' }).first()).id;
    await db('usuarios').where({ id }).update({ eliminado_en: db.fn.now() });
    const invitado = await agente(app);
    await send(invitado, 'post', '/api/auth/login', { usuario: 'ana', clave: 'Ana-Prueba-123' }).expect(401);
    await db('usuarios').where({ id }).update({ eliminado_en: null });
    await entrarComo(app, 'ana');
  });
});

describe('Archivo · compras anuladas', () => {
  it('anula restando stock, oculta de listas y reportes, y reincorpora al restaurar', async () => {
    const ins = await crearInsumo('A-CompraAnulada', { stock: 0, stockReferencia: 0 });
    const antes = Number((await db('insumos').where({ id: ins.id }).first()).stock);
    const c = (await send(admin, 'post', '/api/compras', { insumoId: ins.id, cantidad: 5, unidad: 'und', costo: 7000 }).expect(201)).body;
    const reporte = '/api/reportes/ventas?desde=' + hoy() + '&hasta=' + hoy();
    const conCompra = (await admin.get(reporte).expect(200)).body.compras;
    expect(Number((await db('insumos').where({ id: ins.id }).first()).stock)).toBe(antes + 5);
    const res = await send(admin, 'delete', `/api/compras/${c.id}`).expect(200);
    expect(res.body).toEqual({ ok: true });
    const fila = await db('compras').where({ id: c.id }).first();
    expect(fila.eliminado_en).toBeTruthy();
    expect(Number((await db('insumos').where({ id: ins.id }).first()).stock)).toBe(antes);
    expect((await db('bitacora').orderBy('id', 'desc').first()).accion).toContain('Eliminó la compra');
    expect((await admin.get('/api/compras')).body.map(x => x.id)).not.toContain(c.id);
    expect((await admin.get('/api/compras?eliminados=1')).body.find(x => x.id === c.id).eliminadoEn).toEqual(expect.any(String));
    expect((await admin.get(reporte).expect(200)).body.compras).toBe(conCompra - 7000);
    await send(admin, 'delete', `/api/compras/${c.id}`).expect(404);
    expect(Number((await db('insumos').where({ id: ins.id }).first()).stock)).toBe(antes);
    await send(admin, 'post', `/api/compras/${c.id}/restaurar`).expect(200);
    expect((await db('compras').where({ id: c.id }).first()).eliminado_en).toBeNull();
    expect(Number((await db('insumos').where({ id: ins.id }).first()).stock)).toBe(antes + 5);
    await send(admin, 'post', `/api/compras/${c.id}/restaurar`).expect(404);
  });
});

describe('Archivo · reiniciar reportes', () => {
  let archivados, vivo, sinPagar, cancelado, compra, antes;

  it('archiva solo pedidos cerrados, compras y bitácora sin tocar stock ni ajustes', async () => {
    archivados = (await mesa()).body.pedido;
    await send(admin, 'patch', `/api/pedidos/${archivados.id}/estado`, { estado: 'entregado' }).expect(200);
    await send(ana, 'post', `/api/pedidos/${archivados.id}/pago`, { metodoPago: 'ef' }).expect(200);
    sinPagar = (await mesa()).body.pedido;
    await send(admin, 'patch', `/api/pedidos/${sinPagar.id}/estado`, { estado: 'entregado' }).expect(200);
    cancelado = (await mesa()).body.pedido;
    await send(admin, 'patch', `/api/pedidos/${cancelado.id}/estado`, { estado: 'cancelado' }).expect(200);
    vivo = (await mesa()).body.pedido;
    const ins = await crearInsumo('A-CompraArchivada');
    compra = (await send(admin, 'post', '/api/compras', { insumoId: ins.id, cantidad: 1, unidad: 'und', costo: 33 }).expect(201)).body;
    antes = {
      insumos: await db('insumos').select('id', 'stock', 'stock_referencia', 'costo').orderBy('id'),
      platos: await ids('platos'), usuarios: await ids('usuarios'),
      config: (await db('config').where({ clave: 'general' }).first()).valor,
      puntos: await db('puntos_clientes').select('celular', 'saldo').orderBy('celular'),
    };
    const r = await send(admin, 'post', '/api/admin/reiniciar-reportes', { confirmar: 'BORRAR' }).expect(200);
    expect(r.body).toMatchObject({ ok: true, pedidos: expect.any(Number), compras: expect.any(Number), bitacora: expect.any(Number) });
    expect(r.body.pedidos).toBeGreaterThanOrEqual(2);
    expect(r.body.compras).toBeGreaterThanOrEqual(1);
    for (const id of [archivados.id, cancelado.id]) expect((await db('pedidos').where({ id }).first()).archivado_en).toBeTruthy();
    for (const id of [vivo.id, sinPagar.id]) expect((await db('pedidos').where({ id }).first()).archivado_en).toBeNull();
    expect((await db('pedido_items').where({ pedido_id: archivados.id }).count({ n: '*' }).first()).n).toBeGreaterThan(0);
    expect((await db('compras').where({ id: compra.id }).first()).archivado_en).toBeTruthy();
    await send(admin, 'post', `/api/compras/${compra.id}/restaurar`).expect(404);
    const log = await db('bitacora').whereNull('archivado_en');
    expect(log).toHaveLength(1);
    expect(log[0].accion).toBe('Reinició los reportes');
    expect((await db('bitacora').whereNotNull('archivado_en').count({ n: '*' }).first()).n).toBe(r.body.bitacora);
    expect(await db('insumos').select('id', 'stock', 'stock_referencia', 'costo').orderBy('id')).toEqual(antes.insumos);
    expect(await ids('platos')).toEqual(antes.platos);
    expect(await ids('usuarios')).toEqual(antes.usuarios);
    expect((await db('config').where({ clave: 'general' }).first()).valor).toEqual(antes.config);
    expect(await db('puntos_clientes').select('celular', 'saldo').orderBy('celular')).toEqual(antes.puntos);
  });

  it('las listas ocultan lo archivado y archivados=incluir/solo lo controlan', async () => {
    const pedidos = await admin.get('/api/pedidos?desde=' + hoy() + '&hasta=' + hoy()).expect(200);
    expect(pedidos.body.map(p => p.id)).not.toContain(archivados.id);
    expect(pedidos.body.map(p => p.id)).toContain(vivo.id);
    const incluir = await admin.get('/api/pedidos?archivados=incluir&desde=' + hoy() + '&hasta=' + hoy()).expect(200);
    expect(incluir.body.map(p => p.id)).toContain(archivados.id);
    expect(incluir.body.find(p => p.id === archivados.id).archivadoEn).toEqual(expect.any(String));
    const solo = await admin.get('/api/pedidos?archivados=solo&desde=' + hoy() + '&hasta=' + hoy()).expect(200);
    expect(solo.body.map(p => p.id)).toContain(archivados.id);
    expect(solo.body.map(p => p.id)).not.toContain(vivo.id);
    await admin.get('/api/pedidos?archivados=otro').expect(400);

    const facturas = await admin.get('/api/facturas?porPagina=100').expect(200);
    expect(facturas.body.facturas.map(f => f.id)).not.toContain(archivados.id);
    expect((await admin.get('/api/facturas?archivados=solo&porPagina=100')).body.facturas.map(f => f.id)).toContain(archivados.id);
    await admin.get('/api/facturas?archivados=otro').expect(400);

    const compras = await admin.get('/api/compras').expect(200);
    expect(compras.body.map(c => c.id)).not.toContain(compra.id);
    expect((await admin.get('/api/compras?archivados=solo')).body.map(c => c.id)).toContain(compra.id);
    await admin.get('/api/compras?archivados=otro').expect(400);

    const bitacora = await admin.get('/api/bitacora?limit=1000').expect(200);
    expect(bitacora.body.every(b => b.accion !== 'Ingresó al sistema')).toBe(true);
    expect((await admin.get('/api/bitacora?archivados=solo&limit=1000')).body.some(b => b.accion === 'Ingresó al sistema')).toBe(true);
    await admin.get('/api/bitacora?archivados=otro').expect(400);
  });

  it('los reportes historical excluyen lo archivado salvo con incluir', async () => {
    const url = '/api/reportes/ventas?desde=' + hoy() + '&hasta=' + hoy();
    const actual = (await admin.get(url).expect(200)).body;
    expect(actual.total).toBeGreaterThan(0);
    const incluir = (await admin.get(url + '&archivados=incluir').expect(200)).body;
    expect(incluir.total).toBeGreaterThan(actual.total);
    const solo = (await admin.get(url + '&archivados=solo').expect(200)).body;
    expect(solo.total).toBe(incluir.total - actual.total);
    expect(solo.compras).toBeGreaterThan(0);
    expect(actual.compras).toBe(0);
    await admin.get(url + '&archivados=otro').expect(400);
  });

  it('la tirilla del cliente sigue funcionando con el token del pedido archivado', async () => {
    const cliente = await agente(app);
    const p = (await send(cliente, 'post', '/api/pedidos', web()).expect(201)).body;
    await send(admin, 'patch', `/api/pedidos/${p.pedido.id}/estado`, { estado: 'entregado' }).expect(200);
    await send(ana, 'post', `/api/pedidos/${p.pedido.id}/pago`, { metodoPago: 'ef' }).expect(200);
    await send(admin, 'post', '/api/admin/reiniciar-reportes', { confirmar: 'BORRAR' }).expect(200);
    expect((await db('pedidos').where({ id: p.pedido.id }).first()).archivado_en).toBeTruthy();
    const tirilla = await request(app).get(`/api/pedidos/${p.pedido.id}?token=${p.token}`).expect(200);
    expect(tirilla.body.id).toBe(p.pedido.id);
    expect(tirilla.body.archivadoEn).toEqual(expect.any(String));
  });
});
