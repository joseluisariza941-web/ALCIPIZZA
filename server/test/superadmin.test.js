import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, entrar, instantanea, prepararUsuario, send, testApp } from './helpers.js';

const app = testApp();
const CLAVE = 'Super-Prueba-123';
let restaurar, sa, sa2, admin, dev;

async function crearUsuario(usuario, rol) {
  await db('usuarios').insert({ usuario, nombre: usuario, rol, clave_hash: 'x', debe_cambiar_clave: false });
  await prepararUsuario(usuario, CLAVE);
  return entrar(app, usuario, CLAVE);
}

beforeAll(async () => {
  restaurar = await instantanea();
  await db('suscripcion').where({ id: 1 }).update({ activa: true, hasta: '2099-12-31' });
  sa = await crearUsuario('sa-uno', 'superadmin');
  sa2 = await crearUsuario('sa-dos', 'superadmin');
  admin = await crearUsuario('cocina-sa', 'cocina');
  dev = await crearUsuario('dev-sa', 'dev');
});
afterAll(async () => { await restaurar(); });

const idDe = async u => (await db('usuarios').where({ usuario: u }).first()).id;

describe('superadmin · permisos', () => {
  it('accede a rutas de cocina y de dev', async () => {
    await send(sa, 'get', '/api/config').expect(200);
    await send(sa, 'get', '/api/insumos').expect(200);
    await send(sa, 'get', '/api/suscripcion').expect(200);
    await send(sa, 'get', '/api/bitacora').expect(200);
    await send(sa, 'get', '/api/pedidos').expect(200);
    const lista = (await send(sa, 'get', '/api/usuarios').expect(200)).body;
    expect(lista.some(u => u.rol === 'dev') && lista.some(u => u.rol === 'cocina')).toBe(true);
  });

  it('entra aunque la suscripción esté apagada, y los demás no', async () => {
    await db('suscripcion').where({ id: 1 }).update({ activa: false });
    try {
      await send(sa, 'get', '/api/suscripcion').expect(200);
      await send(sa, 'get', '/api/config').expect(200);
      const nueva = await entrar(app, 'sa-uno', CLAVE);
      expect((await nueva.get('/api/auth/me').expect(200)).body.user.rol).toBe('superadmin');
      await send(admin, 'get', '/api/config').expect(403);
    } finally {
      await db('suscripcion').where({ id: 1 }).update({ activa: true, hasta: '2099-12-31' });
    }
  });
});

describe('superadmin · gestión de usuarios', () => {
  it('crea usuarios de todos los roles', async () => {
    for (const rol of ['mesera', 'cocina', 'dev', 'superadmin']) {
      const r = await send(sa, 'post', '/api/usuarios', { usuario: `nuevo-${rol}`, nombre: `Nuevo ${rol}`, clave: CLAVE, rol }).expect(201);
      expect(r.body.rol).toBe(rol);
    }
  });

  it('un cocina no crea un superadmin ni un dev', async () => {
    await send(admin, 'post', '/api/usuarios', { usuario: 'intruso', nombre: 'Intruso', clave: CLAVE, rol: 'superadmin' }).expect(403);
    await send(admin, 'post', '/api/usuarios', { usuario: 'intruso', nombre: 'Intruso', clave: CLAVE, rol: 'dev' }).expect(403);
    expect(await db('usuarios').where({ usuario: 'intruso' }).first()).toBeUndefined();
  });

  it('un dev no crea, edita ni elimina a un superadmin', async () => {
    await send(dev, 'post', '/api/usuarios', { usuario: 'intruso', nombre: 'Intruso', clave: CLAVE, rol: 'superadmin' }).expect(403);
    const id = await idDe('sa-dos');
    await send(dev, 'put', `/api/usuarios/${id}`, { nombre: 'Cambiado' }).expect(403);
    await send(dev, 'delete', `/api/usuarios/${id}`).expect(403);
    expect((await db('usuarios').where({ id }).first()).nombre).toBe('sa-dos');
  });

  it('un cocina no edita a un superadmin', async () => {
    await send(admin, 'put', `/api/usuarios/${await idDe('sa-dos')}`, { nombre: 'Cambiado' }).expect(403);
  });

  it('un superadmin edita a otro superadmin y a un dev', async () => {
    await send(sa, 'put', `/api/usuarios/${await idDe('dev-sa')}`, { nombre: 'Dev editado' }).expect(200);
    await send(sa, 'put', `/api/usuarios/${await idDe('nuevo-superadmin')}`, { nombre: 'Otro editado' }).expect(200);
  });

  it('nadie se quita el rol a sí mismo: no puede borrarse ni desactivarse', async () => {
    const id = await idDe('sa-uno');
    await send(sa, 'delete', `/api/usuarios/${id}`).expect(400);
    await send(sa, 'put', `/api/usuarios/${id}`, { activo: false }).expect(400);
    const fila = await db('usuarios').where({ id }).first();
    expect(fila.activo).toBeTruthy();
    expect(fila.eliminado_en).toBeNull();
  });

  it('no se puede eliminar ni desactivar al último superadmin activo', async () => {
    // deja un solo superadmin activo: sa-dos; sa-uno lo intenta todo contra él cuando es el último
    await db('usuarios').where({ rol: 'superadmin' }).whereNot({ usuario: 'sa-dos' }).update({ activo: false });
    const id = await idDe('sa-dos');
    await send(sa2, 'delete', `/api/usuarios/${id}`).expect(400);
    await send(sa2, 'put', `/api/usuarios/${id}`, { activo: false }).expect(400);
    expect((await db('usuarios').where({ id }).first()).eliminado_en).toBeNull();
    expect(await db('usuarios').where({ rol: 'superadmin', activo: true, eliminado_en: null }).count({ n: 'id' }).first())
      .toMatchObject({ n: 1 });
    await db('usuarios').where({ rol: 'superadmin' }).update({ activo: true });
  });

  it('un superadmin sí puede eliminar a otro superadmin si queda alguno', async () => {
    const id = await idDe('nuevo-superadmin');
    await send(sa, 'delete', `/api/usuarios/${id}`).expect(200);
    expect((await db('usuarios').where({ id }).first()).eliminado_en).not.toBeNull();
    await send(sa, 'post', `/api/usuarios/${id}/restaurar`).expect(200);
  });
});
