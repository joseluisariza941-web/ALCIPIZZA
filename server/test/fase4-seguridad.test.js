import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { abrirLocal, agente, db, entrarComo, instantanea, prepararUsuario, send, testApp } from './helpers.js';

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
const fila = id => db('pedidos').where({ id }).first();
const saldo = async () => (await db('puntos_clientes').where({ celular: CEL }).first())?.saldo ?? 0;
const dar = n => db('puntos_clientes').insert({ celular: CEL, saldo: n });
const estado = (quien, id, e) => send(quien, 'patch', `/api/pedidos/${id}/estado`, { estado: e });
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

describe('Seguridad · M1 reembolso de puntos una sola vez', () => {
  it('cancelar, reabrir y volver a cancelar no devuelve los puntos dos veces', async () => {
    await dar(300);
    const p = await pedirMesa({ celular: CEL, canjearPuntos: 100 });
    expect(await saldo()).toBe(200);
    await estado(admin, p.id, 'cancelado').expect(200);
    expect(await saldo()).toBe(300);
    const f = await fila(p.id);
    expect(f.puntos_canjeados).toBe(0);
    expect(Number(f.descuento_puntos)).toBe(0);
    expect(Number(f.total)).toBe(precio());
    await estado(admin, p.id, 'nuevo').expect(200);
    await estado(admin, p.id, 'cancelado').expect(200);
    expect(await saldo()).toBe(300);
    const devueltos = await db('puntos_movimientos').where({ pedido_id: p.id, tipo: 'devuelto' });
    expect(devueltos).toHaveLength(1);
  });

  it('dos cancelaciones simultáneas devuelven una sola vez', async () => {
    await dar(300);
    const p = await pedirMesa({ celular: CEL, canjearPuntos: 100 });
    await Promise.all([estado(admin, p.id, 'cancelado'), estado(admin, p.id, 'cancelado')]);
    expect(await saldo()).toBe(300);
  });

  it('un pedido pagado y cancelado revierte lo ganado una sola vez, aunque se reabra y se cancele de nuevo', async () => {
    const p = await pedirMesa({ celular: CEL });
    await send(ana, 'post', `/api/pedidos/${p.id}/pago`, { metodoPago: 'nq' }).expect(200);
    const ganados = Math.floor(precio() / 1000);
    expect(await saldo()).toBe(ganados);
    await estado(admin, p.id, 'cancelado').expect(200);
    expect(await saldo()).toBe(0);
    await db('puntos_clientes').where({ celular: CEL }).update({ saldo: 50 });
    await estado(admin, p.id, 'nuevo').expect(200);
    await estado(admin, p.id, 'cancelado').expect(200);
    expect(await saldo()).toBe(50);
  });

  it('editar tras un canje (personal) no reembolsa dos veces', async () => {
    await dar(300);
    const p = await pedirMesa({ celular: CEL, canjearPuntos: 100 });
    await send(ana, 'put', `/api/pedidos/${p.id}`, { destino: 'Mesa 3', items: [item()], celular: CEL, canjearPuntos: 100 }).expect(200);
    expect(await saldo()).toBe(200);
    await send(ana, 'put', `/api/pedidos/${p.id}`, { destino: 'Mesa 3', items: [item()], celular: CEL, canjearPuntos: 0 }).expect(200);
    expect(await saldo()).toBe(300);
    expect((await fila(p.id)).puntos_canjeados).toBe(0);
    await estado(admin, p.id, 'cancelado').expect(200);
    expect(await saldo()).toBe(300);
  });
});

describe('Seguridad · B3 edición del cliente con canje', () => {
  const conCanje = async () => {
    const p = await pedirWeb({ celular: CEL });
    await dar(200);
    await db('pedidos').where({ id: p.id }).update({ puntos_canjeados: 100, descuento_puntos: 1000, total: precio() - 1000 });
    return p;
  };

  it('congela el canje: ni lo quita con 0 ni cambia el celular', async () => {
    const p = await conCanje();
    await send(p.a, 'put', `/api/pedidos/${p.id}/cliente`, { ...web({ celular: '3109999999', canjearPuntos: 0 }), token: p.token }).expect(200);
    const f = await fila(p.id);
    expect(f.celular).toBe(CEL);
    expect(f.puntos_canjeados).toBe(100);
    expect(await saldo()).toBe(200);
    await send(p.a, 'put', `/api/pedidos/${p.id}/cliente`, { ...web({ celular: CEL }), token: p.token }).expect(200);
    expect(await saldo()).toBe(200);
    expect((await fila(p.id)).puntos_canjeados).toBe(100);
  });

  it('cancelar tras editar devuelve una sola vez', async () => {
    const p = await conCanje();
    await send(p.a, 'put', `/api/pedidos/${p.id}/cliente`, { ...web({ celular: CEL }), token: p.token }).expect(200);
    await send(p.a, 'post', `/api/pedidos/${p.id}/cancelar`, { token: p.token }).expect(200);
    expect(await saldo()).toBe(300);
  });
});

describe('Seguridad · B1 y B4 pedidos pagados', () => {
  it('el cliente no cancela un pedido pagado (409)', async () => {
    const p = await pedirWeb({ celular: CEL });
    await send(ana, 'post', `/api/pedidos/${p.id}/pago`, { metodoPago: 'nq' }).expect(200);
    await send(p.a, 'post', `/api/pedidos/${p.id}/cancelar`, { token: p.token }).expect(409);
    expect((await fila(p.id)).estado).toBe('nuevo');
  });

  it('el personal no edita un pedido pagado (409 PEDIDO_PAGADO)', async () => {
    const p = await pedirMesa({ celular: CEL });
    await send(ana, 'post', `/api/pedidos/${p.id}/pago`, { metodoPago: 'nq' }).expect(200);
    const r = await send(ana, 'put', `/api/pedidos/${p.id}`, { destino: 'Mesa 4', items: [item(), item()], celular: CEL }).expect(409);
    expect(r.body.code).toBe('PEDIDO_PAGADO');
    expect((await fila(p.id)).destino).toBe('Mesa 3');
  });
});

describe('Seguridad · M3 limpieza de sessions y limites', () => {
  it('borra las sesiones vencidas y los límites viejos, y deja lo vigente', async () => {
    const ahora = Math.floor(Date.now() / 1000);
    await db('sessions').insert([
      { session_id: 'v'.repeat(40), expires: ahora - 100, data: '{}' },
      { session_id: 'k'.repeat(40), expires: ahora + 1000, data: '{}' },
    ]);
    await db('limites').insert([
      { clave: 'viejo:1:1.1.1.1', conteo: 5, reinicia_en: ahora - 100 },
      { clave: 'vigente:1:1.1.1.1', conteo: 5, reinicia_en: ahora + 1000 },
    ]);
    await request(app).get('/api/health').expect(200);
    expect(await db('sessions').where({ session_id: 'v'.repeat(40) }).first()).toBeUndefined();
    expect(await db('sessions').where({ session_id: 'k'.repeat(40) }).first()).toBeTruthy();
    expect(await db('limites').where({ clave: 'viejo:1:1.1.1.1' }).first()).toBeUndefined();
    expect(await db('limites').where({ clave: 'vigente:1:1.1.1.1' }).first()).toBeTruthy();
    await db('sessions').where({ session_id: 'k'.repeat(40) }).del();
    await db('limites').where({ clave: 'vigente:1:1.1.1.1' }).del();
  });

  it('GET /api/auth/csrf limita la creación de sesiones por IP (429)', async () => {
    const limitada = testApp({ csrfMax: 3 });
    await db('limites').where('clave', 'like', 'csrf:%').del();
    for (let i = 0; i < 3; i++) await request(limitada).get('/api/auth/csrf').expect(200);
    await request(limitada).get('/api/auth/csrf').expect(429);
    await db('limites').where('clave', 'like', 'csrf:%').del();
  });

  it('con sesión ya creada, pedir el token otra vez no cuenta', async () => {
    const limitada = testApp({ csrfMax: 3 });
    await db('limites').where('clave', 'like', 'csrf:%').del();
    const a = request.agent(limitada);
    for (let i = 0; i < 6; i++) await a.get('/api/auth/csrf').expect(200);
    await db('limites').where('clave', 'like', 'csrf:%').del();
  });
});

describe('Seguridad · B8 health mínimo', () => {
  it('solo responde ok', async () => {
    const r = await request(app).get('/api/health').expect(200);
    expect(r.body).toEqual({ ok: true });
  });
});

describe('Seguridad · B9 logo y fondo', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo=';
  it('acepta https, data de imagen, ruta propia y vacío', async () => {
    for (const v of ['https://x.com/a.png', PNG, '/assets/logo.png', '']) {
      await send(admin, 'put', '/api/config', { logo: v, bg: v }).expect(200);
    }
  });
  it('rechaza http, javascript, SVG, rutas // y otros', async () => {
    for (const v of ['http://x.com/a.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', '//evil.com/a.png', 'data:text/html;base64,AAAA', 'logo.png', '/a b']) {
      const r = await send(admin, 'put', '/api/config', { logo: v }).expect(400);
      expect(r.body.code).toBe('VALIDACION');
      await send(admin, 'put', '/api/config', { bg: v }).expect(400);
    }
  });
  it('un valor viejo ya guardado no rompe la lectura ni otros cambios', async () => {
    const f = await db('config').where({ clave: 'general' }).first();
    const cfg = typeof f.valor === 'string' ? JSON.parse(f.valor) : f.valor;
    await db('config').where({ clave: 'general' }).update({ valor: JSON.stringify({ ...cfg, logo: 'http://viejo/x.png' }) });
    const r = await send(admin, 'get', '/api/config').expect(200);
    expect(r.body.logo).toBe('http://viejo/x.png');
    await send(admin, 'put', '/api/config', { tel: '3000000000' }).expect(200);
  });
});

describe('Seguridad · B10 cuenta bloqueada', () => {
  it('con clave incorrecta responde 401 igual que una credencial mala; con la correcta, 423', async () => {
    await prepararUsuario('ana', 'Ana-Prueba-123', { intentos_fallidos: 0 });
    const a = await agente(app);
    for (let i = 0; i < 5; i++) await send(a, 'post', '/api/auth/login', { usuario: 'ana', clave: 'mala' }).expect(401);
    const mala = await send(a, 'post', '/api/auth/login', { usuario: 'ana', clave: 'mala' }).expect(401);
    expect(mala.body).toEqual({ error: 'Usuario o contraseña incorrectos' });
    const buena = await send(a, 'post', '/api/auth/login', { usuario: 'ana', clave: 'Ana-Prueba-123' }).expect(423);
    expect(buena.body.error).toMatch(/bloquead/i);
    await prepararUsuario('ana', 'Ana-Prueba-123');
  });
});
