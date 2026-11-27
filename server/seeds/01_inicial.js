// Carga inicial: menú, insumos, extras, ajustes, métodos de pago, suscripción y usuarios.
// Es idempotente: si ya hay datos, no los duplica ni los sobrescribe.
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

const menu = JSON.parse(await readFile(new URL('./data/menu.json', import.meta.url), 'utf8'));

async function catalogo(knex) {
  if ((await knex('platos').first('id'))) return console.log('· Catálogo ya cargado, se omite');

  await knex.transaction(async trx => {
    // Insumos y salsas
    const insId = {};
    for (const [nombre, x] of Object.entries(menu.ins)) {
      const [id] = await trx('insumos').insert({
        nombre, tipo: x.k === 's' ? 'salsa' : 'insumo', unidad: x.u,
        stock: x.s, stock_referencia: x.c ?? x.s, costo: x.cost || 0, surtidor_id: null,
      });
      insId[nombre] = id;
    }

    // Extras
    const extraId = {};
    for (const e of menu.extras) {
      const [id] = await trx('extras').insert({
        nombre: e.n, insumo_id: insId[e.ins] ?? null, cantidad: e.q || 0, unidad: e.u || null,
        precio: e.p, grupo: e.grp || null,
      });
      extraId[e.id] = id;
    }

    // Categorías en el orden en que aparecen
    const catId = {};
    for (const c of [...new Set(menu.platos.map(p => p.c))]) {
      [catId[c]] = await trx('categorias').insert({ nombre: c, orden: Object.keys(catId).length });
    }

    // Platos con variantes, ingredientes, salsas y extras
    for (const [i, p] of menu.platos.entries()) {
      const [platoId] = await trx('platos').insert({
        categoria_id: catId[p.c], nombre: p.n, emoji: p.e || null, imagen_url: p.img || null, orden: i,
      });
      if (p.v.length) await trx('plato_variantes').insert(p.v.map((v, o) => ({
        plato_id: platoId, nombre: v.t, precio: v.p, multiplicador: v.m ?? 1, orden: o,
      })));
      const ing = Object.entries(p.i || {}).filter(([n]) => insId[n]);
      if (ing.length) await trx('plato_ingredientes').insert(ing.map(([n, x]) => ({
        plato_id: platoId, insumo_id: insId[n], cantidad: x.q, unidad: x.u || null,
      })));
      const sa = (p.sa || []).filter(n => insId[n]);
      if (sa.length) await trx('plato_salsas').insert(sa.map(n => ({ plato_id: platoId, insumo_id: insId[n] })));
      const ex = (p.ex || []).filter(id => extraId[id]);
      if (ex.length) await trx('plato_extras').insert(ex.map(id => ({ plato_id: platoId, extra_id: extraId[id] })));
    }
  });
  console.log(`· Catálogo: ${menu.platos.length} platos, ${menu.extras.length} extras, ${Object.keys(menu.ins).length} insumos`);
}

async function ajustes(knex) {
  const { pay, ...general } = menu.cfg;
  // La app original guarda los horarios con domingo = 0; la API usa lunes = 0 … domingo = 6.
  general.h = [...general.h.slice(1), general.h[0]];
  await knex('config').insert({ clave: 'general', valor: JSON.stringify(general) }).onConflict('clave').ignore();
  await knex('metodos_pago')
    .insert(Object.entries(pay).map(([codigo, x], orden) => ({
      codigo, nombre: x.n, numero: x.num || null, activo: !!x.on, orden,
    })))
    .onConflict('codigo').ignore();
  const hasta = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  await knex('suscripcion').insert({ id: 1, activa: true, hasta }).onConflict('id').ignore();
}

async function usuarios(knex) {
  const iniciales = [
    { rol: 'dev', usuario: process.env.DEV_USER || 'dev', clave: process.env.DEV_PASS, nombre: 'Desarrollador' },
    { rol: 'cocina', usuario: process.env.ADMIN_USER || 'admin', clave: process.env.ADMIN_PASS, nombre: 'Administración cocina' },
    { rol: 'mesera', usuario: process.env.MESERA_USER || 'ana', clave: process.env.MESERA_PASS, nombre: 'Ana' },
  ];
  // El superadmin solo se crea si se define SUPERADMIN_PASS.
  if (process.env.SUPERADMIN_PASS) {
    iniciales.push({ rol: 'superadmin', usuario: process.env.SUPERADMIN_USER || 'superadmin', clave: process.env.SUPERADMIN_PASS, nombre: 'Superadministrador' });
  }
  for (const u of iniciales) {
    const usuario = u.usuario.trim().toLowerCase();
    if (await knex('usuarios').where({ usuario }).first('id')) continue;
    let clave = u.clave;
    if (!clave || clave.length < 8) {
      clave = randomBytes(9).toString('base64url');
      console.log(`· ${u.rol}: usuario "${usuario}", contraseña temporal generada: ${clave}`);
    }
    await knex('usuarios').insert({
      usuario, nombre: u.nombre, rol: u.rol, clave_hash: await bcrypt.hash(clave, 12), debe_cambiar_clave: true,
    });
    if (u.clave && u.clave.length >= 8) console.log(`· ${u.rol}: usuario "${usuario}" creado con la clave de .env`);
  }
}

/** @param {import('knex').Knex} knex */
export async function seed(knex) {
  await catalogo(knex);
  await ajustes(knex);
  await usuarios(knex);
}
