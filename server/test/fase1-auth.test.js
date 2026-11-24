import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { agente, db, entrar, instantanea, prepararUsuario, send, testApp } from './helpers.js';

const app = testApp();
let restaurar;
beforeAll(async () => { restaurar = await instantanea(); });
afterAll(async () => { await restaurar(); await db.destroy(); });

const sid = res => (res.headers['set-cookie'] || []).find(c => c.startsWith('alcipizza.sid='));

beforeEach(async () => {
  await db('suscripcion').where({ id: 1 }).update({ activa: true, hasta: '2099-12-31' });
  await prepararUsuario('admin', 'Admin-Prueba-123');
  await prepararUsuario('ana', 'Ana-Prueba-123');
  await prepararUsuario('dev', 'Dev-Prueba-123');
});

describe('Fase 1 · cabeceras y CSRF', () => {
  it('usa helmet y no expone x-powered-by', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('GET /api/auth/csrf entrega un token y una cookie httpOnly SameSite=Strict', async () => {
    const res = await request(app).get('/api/auth/csrf').expect(200);
    expect(res.body.csrfToken).toMatch(/^[\w-]{32,}$/);
    const c = sid(res);
    expect(c).toBeTruthy();
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Strict/i);
    expect(c).not.toMatch(/Secure/i); // solo en producción
  });

  it('rechaza un POST sin token CSRF o con uno inválido', async () => {
    const a = await agente(app);
    let res = await a.post('/api/auth/login').send({ usuario: 'admin', clave: 'Admin-Prueba-123' }).expect(403);
    expect(res.body.code).toBe('CSRF');
    res = await a.post('/api/auth/login').set('X-CSRF-Token', 'x'.repeat(43))
      .send({ usuario: 'admin', clave: 'Admin-Prueba-123' }).expect(403);
    expect(res.body.code).toBe('CSRF');
  });
});

describe('Fase 1 · login', () => {
  it('valida el cuerpo con zod', async () => {
    const a = await agente(app);
    const res = await send(a, 'post', '/api/auth/login', { usuario: 'admin' }).expect(400);
    expect(res.body.code).toBe('VALIDACION');
    expect(Array.isArray(res.body.detalles)).toBe(true);
  });

  it('da el mismo mensaje si la clave es mala o si el usuario no existe', async () => {
    const a = await agente(app);
    const r1 = await send(a, 'post', '/api/auth/login', { usuario: 'admin', clave: 'mala-clave' }).expect(401);
    const r2 = await send(a, 'post', '/api/auth/login', { usuario: 'nadie', clave: 'mala-clave' }).expect(401);
    expect(r1.body.error).toBe('Usuario o contraseña incorrectos');
    expect(r2.body.error).toBe(r1.body.error);
  });

  it('entra, regenera la sesión y devuelve el usuario sin datos sensibles', async () => {
    const a = request.agent(app);
    const pre = await a.get('/api/auth/csrf');
    const res = await a.post('/api/auth/login').set('X-CSRF-Token', pre.body.csrfToken)
      .send({ usuario: ' ADMIN ', clave: 'Admin-Prueba-123' }).expect(200);
    expect(res.body.user).toEqual({
      id: expect.any(Number), usuario: 'admin', nombre: 'Administración cocina', rol: 'cocina',
      activo: true, debeCambiarClave: false,
    });
    expect(sid(res)).toBeTruthy();
    expect(sid(res).split(';')[0]).not.toBe(sid(pre).split(';')[0]);
    // el token CSRF anterior ya no sirve
    const post = await a.get('/api/auth/csrf');
    expect(post.body.csrfToken).not.toBe(pre.body.csrfToken);
    const me = await a.get('/api/auth/me').expect(200);
    expect(me.body.user.usuario).toBe('admin');
  });

  it('GET /api/auth/me sin sesión responde 401', async () => {
    await request(app).get('/api/auth/me').expect(401);
  });

  it('un usuario inactivo no puede entrar', async () => {
    await prepararUsuario('ana', 'Ana-Prueba-123', { activo: false });
    const a = await agente(app);
    const res = await send(a, 'post', '/api/auth/login', { usuario: 'ana', clave: 'Ana-Prueba-123' }).expect(401);
    expect(res.body.error).toBe('Usuario o contraseña incorrectos');
  });

  it('bloquea al usuario 15 min tras 5 fallos (423), aunque luego ponga la clave correcta', async () => {
    const a = await agente(app);
    for (let i = 0; i < 4; i++) await send(a, 'post', '/api/auth/login', { usuario: 'ana', clave: 'mala' }).expect(401);
    await send(a, 'post', '/api/auth/login', { usuario: 'ana', clave: 'mala' }).expect(423);
    const res = await send(a, 'post', '/api/auth/login', { usuario: 'ana', clave: 'Ana-Prueba-123' }).expect(423);
    expect(res.body.error).toMatch(/bloquead/i);
    const u = await db('usuarios').where({ usuario: 'ana' }).first();
    const min = (new Date(u.bloqueado_hasta) - Date.now()) / 60000;
    expect(min).toBeGreaterThan(14);
    expect(min).toBeLessThanOrEqual(15.1);
    // vencido el bloqueo, entra y se reinician los intentos
    await db('usuarios').where({ usuario: 'ana' }).update({ bloqueado_hasta: db.raw('NOW() - INTERVAL 1 MINUTE') });
    await send(a, 'post', '/api/auth/login', { usuario: 'ana', clave: 'Ana-Prueba-123' }).expect(200);
    const u2 = await db('usuarios').where({ usuario: 'ana' }).first();
    expect(u2.intentos_fallidos).toBe(0);
    expect(u2.bloqueado_hasta).toBeNull();
  });

  it('limita los intentos por IP (429)', async () => {
    const limitada = testApp({ loginMax: 3 });
    const a = await agente(limitada);
    for (let i = 0; i < 3; i++) await send(a, 'post', '/api/auth/login', { usuario: 'nadie', clave: 'mala' }).expect(401);
    const res = await send(a, 'post', '/api/auth/login', { usuario: 'nadie', clave: 'mala' }).expect(429);
    expect(res.body.error).toBeTruthy();
  });

  it('registra el ingreso en la bitácora con usuario e IP', async () => {
    await entrar(app, 'admin', 'Admin-Prueba-123');
    const fila = await db('bitacora').where({ usuario: 'admin', accion: 'Ingresó al sistema' }).orderBy('id', 'desc').first();
    expect(fila).toBeTruthy();
    expect(fila.ip).toBeTruthy();
    expect(fila.usuario_id).toBeTruthy();
  });
});

describe('Fase 1 · sesión', () => {
  it('logout destruye la sesión', async () => {
    const a = await entrar(app, 'admin', 'Admin-Prueba-123');
    const res = await send(a, 'post', '/api/auth/logout').expect(200);
    expect(res.body).toEqual({ ok: true });
    await a.get('/api/auth/me').expect(401);
  });

  it('la sesión se guarda en MySQL con vencimiento por inactividad de 30 min', async () => {
    const a = await entrar(app, 'admin', 'Admin-Prueba-123');
    await a.get('/api/auth/me').expect(200);
    const filas = await db('sessions').whereRaw("JSON_EXTRACT(data, '$.userId') = ?", [
      (await db('usuarios').where({ usuario: 'admin' }).first()).id]);
    expect(filas.length).toBeGreaterThan(0);
    const restante = Math.max(...filas.map(f => f.expires)) - Date.now() / 1000;
    expect(restante).toBeGreaterThan(29 * 60);
    expect(restante).toBeLessThanOrEqual(30 * 60 + 5);
  });

  it('cierra la sesión tras 30 min sin uso', async () => {
    const a = await entrar(app, 'admin', 'Admin-Prueba-123');
    const u = await db('usuarios').where({ usuario: 'admin' }).first();
    await db('sessions').whereRaw("JSON_EXTRACT(data, '$.userId') = ?", [u.id])
      .update({ expires: Math.floor(Date.now() / 1000) - 1 });
    await a.get('/api/auth/me').expect(401);
  });

  it('cierra la sesión después de 12 h aunque haya actividad', async () => {
    const a = await entrar(app, 'admin', 'Admin-Prueba-123');
    const u = await db('usuarios').where({ usuario: 'admin' }).first();
    await db('sessions').whereRaw("JSON_EXTRACT(data, '$.userId') = ?", [u.id])
      .update({ data: db.raw("JSON_SET(data, '$.creadoEn', ?)", [Date.now() - 12 * 3600e3 - 1000]) });
    await a.get('/api/auth/me').expect(401);
  });
});

describe('Fase 1 · roles y cambio de clave', () => {
  it('requireRole: la mesera no puede ver la bitácora; cocina sí', async () => {
    const ana = await entrar(app, 'ana', 'Ana-Prueba-123');
    const res = await ana.get('/api/bitacora').expect(403);
    expect(res.body.code).toBe('PROHIBIDO');
    const admin = await entrar(app, 'admin', 'Admin-Prueba-123');
    await admin.get('/api/bitacora').expect(200);
  });

  it('sin sesión, las rutas protegidas responden 401', async () => {
    await request(app).get('/api/bitacora').expect(401);
  });

  it('con debeCambiarClave=true solo deja /me, /csrf, /logout y /cambiar-clave', async () => {
    await prepararUsuario('admin', 'Admin-Prueba-123', { debe_cambiar_clave: true });
    const a = await entrar(app, 'admin', 'Admin-Prueba-123');
    const me = await a.get('/api/auth/me').expect(200);
    expect(me.body.user.debeCambiarClave).toBe(true);
    const res = await a.get('/api/bitacora').expect(403);
    expect(res.body.code).toBe('CAMBIAR_CLAVE');
  });

  it('cambiar-clave valida la clave actual y la nueva', async () => {
    const a = await entrar(app, 'admin', 'Admin-Prueba-123');
    let res = await send(a, 'post', '/api/auth/cambiar-clave', { actual: 'otra-cosa', nueva: 'Nueva-Clave-1' }).expect(401);
    expect(res.body.error).toMatch(/actual/i);
    await a.get('/api/auth/me').expect(200); // un 401 aquí no cierra la sesión
    res = await send(a, 'post', '/api/auth/cambiar-clave', { actual: 'Admin-Prueba-123', nueva: 'corta' }).expect(400);
    expect(res.body.code).toBe('VALIDACION');
    res = await send(a, 'post', '/api/auth/cambiar-clave', { actual: 'Admin-Prueba-123', nueva: 'Admin-Prueba-123' }).expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDACION', error: expect.stringMatching(/distinta/i) });
  });

  it('cambiar-clave quita el cambio obligatorio y cierra las otras sesiones del usuario', async () => {
    await prepararUsuario('admin', 'Admin-Prueba-123', { debe_cambiar_clave: true });
    const otra = await entrar(app, 'admin', 'Admin-Prueba-123');
    const a = await entrar(app, 'admin', 'Admin-Prueba-123');
    const ana = await entrar(app, 'ana', 'Ana-Prueba-123');
    const res = await send(a, 'post', '/api/auth/cambiar-clave', { actual: 'Admin-Prueba-123', nueva: 'Nueva-Clave-2026' }).expect(200);
    expect(res.body).toEqual({ ok: true });
    const me = await a.get('/api/auth/me').expect(200);
    expect(me.body.user.debeCambiarClave).toBe(false);
    await a.get('/api/bitacora').expect(200);
    await otra.get('/api/auth/me').expect(401);
    await ana.get('/api/auth/me').expect(200); // otras personas no se ven afectadas
    await entrar(app, 'admin', 'Nueva-Clave-2026');
  });
});

describe('Fase 1 · suscripción', () => {
  it('con la suscripción inactiva, cocina y mesera reciben 403 SUSPENDIDO; dev entra', async () => {
    const abierta = await entrar(app, 'admin', 'Admin-Prueba-123');
    await db('suscripcion').where({ id: 1 }).update({ activa: false });
    const a = await agente(app);
    const res = await send(a, 'post', '/api/auth/login', { usuario: 'admin', clave: 'Admin-Prueba-123' }).expect(403);
    expect(res.body.code).toBe('SUSPENDIDO');
    const r2 = await abierta.get('/api/bitacora').expect(403);
    expect(r2.body.code).toBe('SUSPENDIDO');
    const dev = await entrar(app, 'dev', 'Dev-Prueba-123');
    await dev.get('/api/bitacora').expect(200);
  });

  it('una suscripción vencida cuenta como inactiva', async () => {
    await db('suscripcion').where({ id: 1 }).update({ activa: true, hasta: '2020-01-01' });
    const a = await agente(app);
    const res = await send(a, 'post', '/api/auth/login', { usuario: 'ana', clave: 'Ana-Prueba-123' }).expect(403);
    expect(res.body.code).toBe('SUSPENDIDO');
  });
});
