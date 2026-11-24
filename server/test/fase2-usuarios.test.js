import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, entrar, entrarComo, instantanea, send, testApp } from './helpers.js';

const app = testApp();
let restaurar, admin, dev, ana;

beforeAll(async () => {
  restaurar = await instantanea();
  await db('suscripcion').where({ id: 1 }).update({ activa: true, hasta: '2099-12-31' });
  admin = await entrarComo(app, 'admin');
  dev = await entrarComo(app, 'dev');
  ana = await entrarComo(app, 'ana');
});
afterAll(async () => {
  await db('usuarios').whereNotIn('usuario', ['dev', 'admin', 'ana']).del();
  await restaurar();
  await db.destroy();
});

describe('Fase 2 · usuarios', () => {
  it('cocina ve solo meseras; dev ve a todos; mesera no entra', async () => {
    const a = await admin.get('/api/usuarios').expect(200);
    expect(a.body.every(u => u.rol === 'mesera')).toBe(true);
    expect(a.body[0]).toEqual({ id: expect.any(Number), usuario: 'ana', nombre: 'Ana', rol: 'mesera', activo: true, debeCambiarClave: false });
    const d = await dev.get('/api/usuarios').expect(200);
    expect(d.body.map(u => u.rol).sort()).toEqual(['cocina', 'dev', 'mesera']);
    await ana.get('/api/usuarios').expect(403);
  });

  it('cocina crea meseras (en minúsculas y con cambio obligatorio), no otros roles', async () => {
    const res = await send(admin, 'post', '/api/usuarios', { usuario: 'Lucia', nombre: 'Lucía', clave: 'Lucia-2026!', rol: 'mesera' }).expect(201);
    expect(res.body).toMatchObject({ usuario: 'lucia', nombre: 'Lucía', rol: 'mesera', debeCambiarClave: true, activo: true });
    await send(admin, 'post', '/api/usuarios', { usuario: 'lucia', nombre: 'Otra', clave: 'Lucia-2026!', rol: 'mesera' }).expect(409);
    await send(admin, 'post', '/api/usuarios', { usuario: 'jefe', nombre: 'Jefe', clave: 'Jefe-2026!!', rol: 'cocina' }).expect(403);
    await send(admin, 'post', '/api/usuarios', { usuario: 'corta', nombre: 'C', clave: '1234567', rol: 'mesera' }).expect(400);
    await send(admin, 'post', '/api/usuarios', { usuario: 'a b', nombre: 'C', clave: '12345678', rol: 'mesera' }).expect(400);
    const fila = await db('usuarios').where({ usuario: 'lucia' }).first();
    expect(fila.clave_hash).not.toContain('Lucia');
  });

  it('dev crea cocina y mesera, pero no dev', async () => {
    await send(dev, 'post', '/api/usuarios', { usuario: 'jefe', nombre: 'Jefe', clave: 'Jefe-2026!!', rol: 'cocina' }).expect(201);
    await send(dev, 'post', '/api/usuarios', { usuario: 'otrodev', nombre: 'Dev 2', clave: 'Dev2-2026!!', rol: 'dev' }).expect(403);
  });

  it('PUT: cocina edita meseras; cambiar la clave cierra las sesiones de ese usuario', async () => {
    const lucia = await db('usuarios').where({ usuario: 'lucia' }).first();
    await db('usuarios').where({ id: lucia.id }).update({ debe_cambiar_clave: false });
    const sesion = await entrar(app, 'lucia', 'Lucia-2026!');
    const res = await send(admin, 'put', `/api/usuarios/${lucia.id}`, { nombre: 'Lucía P.', clave: 'Nueva-Lucia-1' }).expect(200);
    expect(res.body).toMatchObject({ nombre: 'Lucía P.', debeCambiarClave: true });
    await sesion.get('/api/auth/me').expect(401);
    const jefe = await db('usuarios').where({ usuario: 'jefe' }).first();
    await send(admin, 'put', `/api/usuarios/${jefe.id}`, { nombre: 'X' }).expect(403);
    await send(admin, 'put', '/api/usuarios/999999', { nombre: 'X' }).expect(404);
    await send(dev, 'put', `/api/usuarios/${jefe.id}`, { nombre: 'Jefe de cocina', activo: false }).expect(200);
    const sin = await db('usuarios').where({ id: jefe.id }).first();
    expect(sin.activo).toBe(0);
    // no puede quedar un usuario repetido
    await send(dev, 'put', `/api/usuarios/${jefe.id}`, { usuario: 'lucia' }).expect(409);
  });

  it('DELETE: cocina borra meseras; nadie se borra a sí mismo', async () => {
    const lucia = await db('usuarios').where({ usuario: 'lucia' }).first();
    const yo = await db('usuarios').where({ usuario: 'admin' }).first();
    const jefe = await db('usuarios').where({ usuario: 'jefe' }).first();
    await send(admin, 'delete', `/api/usuarios/${jefe.id}`).expect(403);
    await send(admin, 'delete', `/api/usuarios/${yo.id}`).expect(403);
    const devYo = await db('usuarios').where({ usuario: 'dev' }).first();
    await send(dev, 'delete', `/api/usuarios/${devYo.id}`).expect(400);
    await send(admin, 'delete', `/api/usuarios/${lucia.id}`).expect(200);
    await send(dev, 'delete', `/api/usuarios/${jefe.id}`).expect(200);
    expect(await db('usuarios').whereIn('id', [lucia.id, jefe.id])).toEqual([]);
  });
});

describe('Fase 2 · perfil propio', () => {
  it('cualquier usuario cambia su propio usuario y nombre confirmando su contraseña', async () => {
    const a = await entrarComo(app, 'admin');
    await send(a, 'put', '/api/auth/perfil', { usuario: 'cocina1', actual: 'mala-clave' }).expect(401);
    await send(a, 'put', '/api/auth/perfil', { usuario: 'ana', actual: 'Admin-Prueba-123' }).expect(409);
    await send(a, 'put', '/api/auth/perfil', { usuario: 'a b', actual: 'Admin-Prueba-123' }).expect(400);
    const res = await send(a, 'put', '/api/auth/perfil', { usuario: 'Cocina1', nombre: 'Jefe de cocina', actual: 'Admin-Prueba-123' }).expect(200);
    expect(res.body.user).toMatchObject({ usuario: 'cocina1', nombre: 'Jefe de cocina', rol: 'cocina' });
    await a.get('/api/auth/me').expect(200); // la sesión sigue
    await entrar(app, 'cocina1', 'Admin-Prueba-123');
    await send(a, 'put', '/api/auth/perfil', { usuario: 'admin', nombre: 'Administración cocina', actual: 'Admin-Prueba-123' }).expect(200);
  });
});

describe('Fase 2 · suscripción', () => {
  it('solo dev la consulta y la cambia', async () => {
    const res = await dev.get('/api/suscripcion').expect(200);
    expect(res.body).toEqual({ activa: true, hasta: '2099-12-31' });
    await admin.get('/api/suscripcion').expect(403);
    const ed = await send(dev, 'put', '/api/suscripcion', { hasta: '2030-06-30' }).expect(200);
    expect(ed.body).toEqual({ activa: true, hasta: '2030-06-30' });
    await send(dev, 'put', '/api/suscripcion', { hasta: '30/06/2030' }).expect(400);
    const off = await send(dev, 'put', '/api/suscripcion', { activa: false }).expect(200);
    expect(off.body.activa).toBe(false);
    const r = await admin.get('/api/insumos').expect(403);
    expect(r.body.code).toBe('SUSPENDIDO');
    await send(dev, 'put', '/api/suscripcion', { activa: true, hasta: '2099-12-31' }).expect(200);
  });
});

describe('Fase 2 · bitácora', () => {
  it('registra las acciones con el usuario real y respeta el límite', async () => {
    const res = await dev.get('/api/bitacora?limit=5').expect(200);
    expect(res.body).toHaveLength(5);
    expect(res.body[0]).toMatchObject({ id: expect.any(Number), usuario: 'dev', nombre: 'Desarrollador' });
    expect(res.body[0].accion).toMatch(/suscripci/i);
    expect(res.body[0].id).toBeGreaterThan(res.body[1].id);
    const todas = await admin.get('/api/bitacora').expect(200);
    expect(todas.body.some(b => /Lucía/.test(b.accion) && b.usuario === 'admin')).toBe(true);
    await dev.get('/api/bitacora?limit=0').expect(400);
  });
});
