import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { testApp } from './helpers.js';
import { db } from '../db.js';

const app = testApp();
afterAll(() => db.destroy());

describe('Fase 0 · base de datos y API', () => {
  it('GET /api/health confirma que MySQL responde', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.mysql).toMatch(/^8\./);
  });

  it('crea las tablas del esquema normalizado', async () => {
    const [rows] = await db.raw('SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()');
    const tablas = rows.map(r => r.t);
    for (const t of ['usuarios', 'sessions', 'platos', 'plato_variantes', 'plato_ingredientes', 'extras',
      'insumos', 'surtidores', 'compras', 'pedidos', 'pedido_items', 'bitacora', 'config', 'suscripcion']) {
      expect(tablas).toContain(t);
    }
  });

  it('carga el menú de ejemplo con sus variantes', async () => {
    const res = await request(app).get('/api/menu').expect(200);
    expect(res.body).toHaveLength(8);
    const pizza = res.body.find(p => p.nombre === 'Pizza');
    expect(pizza.categoria).toBe('Pizzas');
    expect(pizza.variantes.map(v => v.precio)).toEqual([6000, 16000, 28000, 38000]);
  });

  it('crea los tres usuarios iniciales con la clave cifrada y cambio obligatorio', async () => {
    const usuarios = await db('usuarios').orderBy('id');
    expect(usuarios.map(u => [u.usuario, u.rol])).toEqual([['dev', 'dev'], ['admin', 'cocina'], ['ana', 'mesera']]);
    const admin = usuarios.find(u => u.usuario === 'admin');
    expect(admin.clave_hash).not.toContain('Admin-Prueba-123');
    expect(await bcrypt.compare('Admin-Prueba-123', admin.clave_hash)).toBe(true);
    expect(admin.debe_cambiar_clave).toBe(1);
  });

  it('el seed es idempotente: correrlo otra vez no duplica datos', async () => {
    await db.seed.run();
    const [{ n }] = await db('platos').count({ n: '*' });
    const [{ u }] = await db('usuarios').count({ u: '*' });
    expect(Number(n)).toBe(8);
    expect(Number(u)).toBe(3);
  });

  it('rutas /api desconocidas responden 404 en JSON', async () => {
    const res = await request(app).get('/api/no-existe').expect(404);
    expect(res.body.error).toBeTruthy();
  });
});
