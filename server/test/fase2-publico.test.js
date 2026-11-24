import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { abrirLocal, db, instantanea, testApp } from './helpers.js';

const app = testApp();
let restaurar;
beforeAll(async () => { restaurar = await instantanea(); await abrirLocal(); });
afterAll(async () => { await restaurar(); await db.destroy(); });

const ponerHorario = async h => {
  const fila = await db('config').where({ clave: 'general' }).first();
  const cfg = typeof fila.valor === 'string' ? JSON.parse(fila.valor) : fila.valor;
  await db('config').where({ clave: 'general' }).update({ valor: JSON.stringify({ ...cfg, h }) });
};

describe('Fase 2 · config pública', () => {
  it('devuelve config, solo pagos activos, abierto y suscripcionActiva', async () => {
    await db('metodos_pago').where({ codigo: 'dv' }).update({ activo: false });
    const res = await request(app).get('/api/public/config').expect(200);
    expect(res.body.config.n).toBe('Alcipizza');
    expect(res.body.config.h).toHaveLength(7);
    expect(res.body.config.mesas).toBe(8);
    expect(res.body.abierto).toBe(true);
    expect(res.body.suscripcionActiva).toBe(true);
    expect(res.body.pagos.map(p => p.codigo)).not.toContain('dv');
    expect(res.body.pagos[0]).toEqual({ codigo: 'ef', nombre: 'Efectivo', numero: null, activo: true });
    await db('metodos_pago').where({ codigo: 'dv' }).update({ activo: true });
  });

  it('abierto=false si hoy está cerrado', async () => {
    await ponerHorario(Array(7).fill(null));
    const res = await request(app).get('/api/public/config').expect(200);
    expect(res.body.abierto).toBe(false);
    await abrirLocal();
  });

  it('el seed guarda los horarios con lunes primero (el martes original queda cerrado)', async () => {
    const { seed } = await import('../seeds/01_inicial.js');
    const antes = await db('config').where({ clave: 'general' }).first();
    await db('config').where({ clave: 'general' }).del();
    await seed(db);
    const fila = await db('config').where({ clave: 'general' }).first();
    const cfg = typeof fila.valor === 'string' ? JSON.parse(fila.valor) : fila.valor;
    expect(cfg.h[1]).toBeNull();
    expect(cfg.h.filter(x => x === null)).toHaveLength(1);
    await db('config').where({ clave: 'general' }).update({ valor: typeof antes.valor === 'string' ? antes.valor : JSON.stringify(antes.valor) });
  });
});

describe('Fase 2 · menú público', () => {
  it('devuelve los platos activos con variantes, ingredientes, salsas y extras', async () => {
    const res = await request(app).get('/api/menu').expect(200);
    const burger = res.body.find(p => p.nombre === 'Hamburguesa');
    expect(burger).toMatchObject({ emoji: '🍔', categoria: 'Hamburguesas', imagenUrl: null });
    expect(burger.variantes[0]).toEqual({ id: expect.any(Number), nombre: 'Sencilla', precio: 14000 });
    expect(burger.ingredientes).toEqual(['Pan', 'Carne', 'Queso', 'Tomate', 'Lechuga']);
    expect(burger.salsas).toEqual(['Ketchup', 'Mayonesa', 'Mostaza']);
    expect(burger.extras).toContainEqual({ id: expect.any(Number), nombre: 'Papas pequeña', precio: 3000, grupo: 'papas' });
    expect(burger.extras).toContainEqual({ id: expect.any(Number), nombre: 'Queso extra', precio: 2000, grupo: null });
  });

  it('no muestra los platos inactivos', async () => {
    await db('platos').where({ nombre: 'Pepsi' }).update({ activo: false });
    const res = await request(app).get('/api/menu').expect(200);
    expect(res.body.map(p => p.nombre)).not.toContain('Pepsi');
    await db('platos').where({ nombre: 'Pepsi' }).update({ activo: true });
  });
});
