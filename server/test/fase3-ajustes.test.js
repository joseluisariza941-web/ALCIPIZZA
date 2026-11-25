import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { abrirLocal, agente, db, entrarComo, instantanea, send, testApp } from './helpers.js';

const app = testApp();
let restaurar, admin, ana, menu;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const hamb = () => menu.find(p => p.nombre === 'Hamburguesa');
const item = () => ({ platoId: hamb().id, varianteId: hamb().variantes[0].id });
const web = (o = {}) => ({ destino: 'Domicilio', cliente: 'Juan', direccion: 'Cra 1', telefono: '3001234567', metodoPago: 'nq', items: [item()], ...o });

beforeAll(async () => {
  restaurar = await instantanea();
  await abrirLocal();
  menu = (await request(app).get('/api/menu')).body;
  admin = await entrarComo(app, 'admin');
  ana = await entrarComo(app, 'ana');
});
afterAll(async () => { await restaurar(); await db.destroy(); });

describe('Fase 3 · B6 sonido de notificación', () => {
  it('guarda uno de los 5 sonidos y lo rechaza si no existe', async () => {
    for (const s of ['campana', 'timbre', 'pulso', 'arpegio', 'alarma']) {
      const r = await send(admin, 'put', '/api/config', { sonido: s }).expect(200);
      expect(r.body.sonido).toBe(s);
    }
    await send(admin, 'put', '/api/config', { sonido: 'trompeta' }).expect(400);
    expect((await admin.get('/api/config')).body.sonido).toBe('alarma');
    expect((await request(app).get('/api/public/config')).body.config.sonido).toBe('alarma');
  });
});

describe('Fase 3 · B9 domicilios', () => {
  it('apagado: el pedido web a domicilio responde 409 y lo demás sigue', async () => {
    await send(admin, 'put', '/api/config', { domiciliosActivos: false }).expect(200);
    expect((await request(app).get('/api/public/config')).body.config.domiciliosActivos).toBe(false);
    const c = await agente(app);
    const r = await send(c, 'post', '/api/pedidos', web()).expect(409);
    expect(r.body.error).toMatch(/domicilio/i);
    expect(r.body.code).toBe('DOMICILIOS_APAGADOS');
    await send(c, 'post', '/api/pedidos', web({ destino: 'Recoger en local' })).expect(201);
    await send(ana, 'post', '/api/pedidos', { destino: 'Domicilio', direccion: 'x', items: [item()] }).expect(201);
    await send(admin, 'put', '/api/config', { domiciliosActivos: true }).expect(200);
    await send(c, 'post', '/api/pedidos', web()).expect(201);
    await send(admin, 'put', '/api/config', { domiciliosActivos: 'si' }).expect(400);
  });
});

describe('Fase 3 · B3 imagen QR del método de pago', () => {
  it('crea y edita un método con QR; el cliente lo ve en la config pública', async () => {
    const c = await send(admin, 'post', '/api/metodos-pago', { nombre: 'Daviplata T3', numero: '300', qrUrl: PNG }).expect(201);
    expect(c.body).toEqual({ codigo: expect.any(String), nombre: 'Daviplata T3', numero: '300', activo: true, qrUrl: PNG });
    const pub = (await request(app).get('/api/public/config')).body.pagos.find(m => m.codigo === c.body.codigo);
    expect(pub.qrUrl).toBe(PNG);
    const sin = await send(admin, 'put', `/api/metodos-pago/${c.body.codigo}`, { qrUrl: null }).expect(200);
    expect(sin.body.qrUrl).toBeNull();
    const otra = await send(admin, 'put', `/api/metodos-pago/${c.body.codigo}`, { qrUrl: PNG }).expect(200);
    expect(otra.body.qrUrl).toBe(PNG);
    expect((await admin.get('/api/metodos-pago')).body.find(m => m.codigo === 'nq').qrUrl).toBeNull();
  });

  it('valida el tipo y el tamaño de la imagen', async () => {
    const mal = ['data:text/html;base64,PGgxPg==', 'data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)', 'hola',
      'data:image/png;base64,' + 'A'.repeat(800_000)];
    for (const qrUrl of mal) await send(admin, 'post', '/api/metodos-pago', { nombre: 'Malo', qrUrl }).expect(400);
    await send(admin, 'post', '/api/metodos-pago', { nombre: 'Con enlace', qrUrl: 'https://x.co/qr.png' }).expect(201);
    expect(await db('metodos_pago').where({ nombre: 'Malo' }).first()).toBeUndefined();
  });
});
