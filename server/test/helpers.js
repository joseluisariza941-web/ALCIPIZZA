// Utilidades compartidas por las pruebas de la API.
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';

/**
 * URL del servidor PHP de pruebas (ver test/php-setup.js): uno normal y otros dos con
 * límites bajos de login o de pedidos web para probar el rate limit.
 */
export const testApp = (opts = {}) => {
  const b = Number(process.env.ALCI_PORT_BASE || 3100);
  return `http://127.0.0.1:${b + (opts.loginMax ? 2 : opts.pedidosWebMax ? 3 : opts.csrfMax ? 4 : 1)}`;
};

/** Deja a un usuario listo para entrar con la clave indicada (sin cambio obligatorio, sin bloqueo). */
export async function prepararUsuario(usuario, clave, extra = {}) {
  await db('usuarios').where({ usuario }).update({
    clave_hash: await bcrypt.hash(clave, 4), debe_cambiar_clave: false, intentos_fallidos: 0,
    bloqueado_hasta: null, activo: true, eliminado_en: null, ...extra,
  });
  return db('usuarios').where({ usuario }).first();
}

/** Agente con cookie de sesión y token CSRF en `a.csrf`. */
export async function agente(app) {
  const a = request.agent(app);
  a.csrf = (await a.get('/api/auth/csrf').expect(200)).body.csrfToken;
  return a;
}

/** Envía una petición con el token CSRF del agente. */
export const send = (a, metodo, url, body) => {
  const r = a[metodo](url).set('X-CSRF-Token', a.csrf || '');
  return body === undefined ? r : r.send(body);
};

/** Inicia sesión y devuelve el agente con el token CSRF nuevo. */
export async function entrar(app, usuario, clave) {
  const a = await agente(app);
  await send(a, 'post', '/api/auth/login', { usuario, clave }).expect(200);
  a.csrf = (await a.get('/api/auth/csrf').expect(200)).body.csrfToken;
  return a;
}

/** Usuarios de prueba listos para usar (claves conocidas). */
export const CLAVES = { dev: 'Dev-Prueba-123', admin: 'Admin-Prueba-123', ana: 'Ana-Prueba-123' };
export async function entrarComo(app, usuario) {
  await prepararUsuario(usuario, CLAVES[usuario]);
  return entrar(app, usuario, CLAVES[usuario]);
}

/** Horario abierto todo el día, todos los días, y suscripción activa. */
export async function abrirLocal() {
  const fila = await db('config').where({ clave: 'general' }).first();
  const cfg = typeof fila.valor === 'string' ? JSON.parse(fila.valor) : fila.valor;
  cfg.h = Array(7).fill([0, 24]);
  await db('config').where({ clave: 'general' }).update({ valor: JSON.stringify(cfg) });
  await db('suscripcion').where({ id: 1 }).update({ activa: true, hasta: '2099-12-31' });
}

export { db };

/**
 * Guarda el estado de los usuarios iniciales y la suscripción para dejarlos igual al terminar
 * (otras pruebas, como la de fase 0, esperan los datos del seed).
 */
export async function instantanea() {
  const usuarios = await db('usuarios').whereIn('usuario', ['dev', 'admin', 'ana']);
  const sub = await db('suscripcion').where({ id: 1 }).first();
  const cfg = await db('config').where({ clave: 'general' }).first();
  const insumos = await db('insumos').select('id', 'stock', 'stock_referencia', 'costo', 'surtidor_id', 'eliminado_en');
  const metodos = await db('metodos_pago');
  const max = {};
  for (const t of ['pedidos', 'compras', 'platos', 'extras', 'insumos', 'surtidores', 'categorias', 'usuarios', 'promociones']) {
    max[t] = (await db(t).max({ m: 'id' }).first()).m ?? 0;
  }
  return async () => {
    // borra lo que creó el archivo de pruebas y devuelve el inventario a como estaba
    for (const t of ['pedidos', 'compras', 'platos', 'extras', 'insumos', 'surtidores', 'categorias', 'usuarios', 'promociones']) {
      await db(t).where('id', '>', max[t]).del();
    }
    for (const i of insumos) {
      const { id, ...resto } = i;
      await db('insumos').where({ id }).update(resto);
    }
    await db('metodos_pago').whereNotIn('codigo', metodos.map(m => m.codigo)).del();
    for (const m of metodos) await db('metodos_pago').where({ codigo: m.codigo }).update(m);
    await db('platos').update({ activo: true, eliminado_en: null });
    await db('extras').update({ eliminado_en: null });
    await db('surtidores').update({ eliminado_en: null });
    await db('promociones').update({ eliminado_en: null });
    await db('pedidos').update({ archivado_en: null });
    await db('compras').update({ archivado_en: null, eliminado_en: null });
    await db('bitacora').update({ archivado_en: null });
    for (const u of usuarios) {
      const { id, clave_hash, debe_cambiar_clave, activo, nombre, rol, eliminado_en } = u;
      await db('usuarios').where({ id }).update({
        clave_hash, debe_cambiar_clave, activo, nombre, rol, usuario: u.usuario, eliminado_en, intentos_fallidos: 0, bloqueado_hasta: null,
      });
    }
    await db('suscripcion').where({ id: 1 }).update({ activa: sub.activa, hasta: sub.hasta });
    await db('config').where({ clave: 'general' }).update({ valor: typeof cfg.valor === 'string' ? cfg.valor : JSON.stringify(cfg.valor) });
    await db('sessions').del();
  };
}
