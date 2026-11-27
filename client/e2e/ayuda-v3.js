// @ts-check
// Ayudas de las pruebas de la v3: sesión por API, datos propios por prueba y pasos comunes del navegador.
import { expect } from '@playwright/test';
import { USUARIOS } from './ayuda.js';

let contador = 0;

/** Sufijo corto y único para que cada prueba use sus propios nombres. */
export const unico = () => `${Date.now().toString(36).slice(-4)}${(contador++).toString(36)}${Math.floor(Math.random() * 36).toString(36)}`;

/** Celular colombiano válido (10 dígitos que empiezan por 3) distinto en cada llamada. */
export const celularUnico = () => `3${String(Date.now()).slice(-7)}${String(contador++ % 100).padStart(2, '0')}`;

/**
 * Cliente de la API con cookie y CSRF propios. Sin sesión navega como cliente web.
 * @param {import('@playwright/test').APIRequestContext} ctx
 */
export function clienteApi(ctx) {
  /** @type {string|null} */
  let csrf = null;
  const token = async () => (csrf ??= (await (await ctx.get('/api/auth/csrf')).json()).csrfToken);
  /** @param {string} metodo @param {string} ruta @param {any} [cuerpo] */
  async function llamar(metodo, ruta, cuerpo) {
    const opciones = metodo === 'GET' ? {} : { headers: { 'X-CSRF-Token': await token() }, data: cuerpo ?? {} };
    const r = await ctx.fetch(ruta, { method: metodo, ...opciones });
    let datos = null;
    try { datos = await r.json(); } catch { /* sin cuerpo */ }
    return { status: r.status(), ok: r.ok(), datos };
  }
  return {
    ctx,
    get: (/** @type {string} */ r) => llamar('GET', r),
    post: (/** @type {string} */ r, /** @type {any} */ c) => llamar('POST', r, c),
    put: (/** @type {string} */ r, /** @type {any} */ c) => llamar('PUT', r, c),
    patch: (/** @type {string} */ r, /** @type {any} */ c) => llamar('PATCH', r, c),
    del: (/** @type {string} */ r) => llamar('DELETE', r),
    reiniciarCsrf: () => { csrf = null; },
  };
}

/**
 * Inicia sesión por API (sin pasar por la pantalla). Si es la primera vez, cambia la clave obligatoria.
 * @param {ReturnType<typeof clienteApi>} api @param {{usuario:string, inicial:string, nueva:string}} u
 */
export async function iniciarSesion(api, u) {
  let r = await api.post('/api/auth/login', { usuario: u.usuario, clave: u.nueva });
  api.reiniciarCsrf();
  if (r.status === 401) {
    r = await api.post('/api/auth/login', { usuario: u.usuario, clave: u.inicial });
    api.reiniciarCsrf();
    if (r.ok && r.datos?.user?.debeCambiarClave) {
      const c = await api.post('/api/auth/cambiar-clave', { actual: u.inicial, nueva: u.nueva });
      expect(c.ok, 'cambiar la clave obligatoria').toBe(true);
    }
  }
  expect(r.ok, `iniciar sesión como ${u.usuario}`).toBe(true);
}

/**
 * Cliente de API ya autenticado como cocina.
 * @param {import('@playwright/test').Playwright} playwright @param {string} baseURL
 */
export async function apiCocina(playwright, baseURL) {
  const api = clienteApi(await playwright.request.newContext({ baseURL }));
  await iniciarSesion(api, USUARIOS.admin);
  return api;
}

/** Cliente de API sin sesión (cliente web). @param {import('@playwright/test').Playwright} playwright @param {string} baseURL */
export async function apiCliente(playwright, baseURL) {
  return clienteApi(await playwright.request.newContext({ baseURL }));
}

/**
 * Deja la página con la sesión de cocina abierta (la cookie se comparte con el contexto del navegador).
 * @param {import('@playwright/test').Page} page
 */
export async function sesionCocina(page) {
  await iniciarSesion(clienteApi(page.request), USUARIOS.admin);
}

/**
 * Crea un plato propio de la prueba (una sola variante, sin receta) y devuelve sus ids.
 * @param {ReturnType<typeof clienteApi>} api @param {string} nombre @param {number} precio
 */
export async function crearPlato(api, nombre, precio) {
  const r = await api.post('/api/admin/platos', {
    nombre, emoji: '🍕', categoria: 'Pruebas E2E', variantes: [{ nombre: 'Unica', precio }],
  });
  expect(r.status, 'crear plato: ' + JSON.stringify(r.datos)).toBe(201);
  return { id: r.datos.id, varianteId: r.datos.variantes[0].id, nombre, precio };
}

/** Oculta un plato (limpieza; ignora si ya estaba oculto). @param {ReturnType<typeof clienteApi>} api @param {number} id */
export async function quitarPlato(api, id) { await api.del(`/api/admin/platos/${id}`); }

/**
 * Pedido web por API. Devuelve `{ id, token, pedido }`.
 * @param {ReturnType<typeof clienteApi>} cliente
 * @param {{id:number, varianteId:number}} plato @param {{cliente?:string, celular?:string}} [o]
 */
export async function pedidoWebApi(cliente, plato, o = {}) {
  const r = await cliente.post('/api/pedidos', {
    destino: 'Recoger en local', cliente: o.cliente || 'Cliente E2E', telefono: '3001112233', metodoPago: 'ef',
    ...(o.celular ? { celular: o.celular } : {}),
    items: [{ platoId: plato.id, varianteId: plato.varianteId, extras: [], salsas: [], sin: [], nota: '' }],
  });
  expect(r.status, 'crear pedido web: ' + JSON.stringify(r.datos)).toBe(201);
  return { id: r.datos.pedido.id, token: r.datos.token, pedido: r.datos.pedido };
}

/** Cambia ajustes con un PUT parcial. @param {ReturnType<typeof clienteApi>} api @param {Record<string, any>} c */
export async function ajustar(api, c) {
  const r = await api.put('/api/config', c);
  expect(r.ok, 'PUT /api/config: ' + JSON.stringify(r.datos)).toBe(true);
}

/** Tarjeta de un plato en el menú del cliente. @param {import('@playwright/test').Page} page @param {string} nombre */
export const tarjetaPlato = (page, nombre) =>
  page.locator('.grid .card', { has: page.getByRole('heading', { name: nombre, exact: true }) });

/** Elige un plato del menú (única variante) y lo agrega al pre-ticket. @param {import('@playwright/test').Page} page @param {string} plato */
export async function agregarPlato(page, plato) {
  await tarjetaPlato(page, plato).getByRole('button', { name: 'Elegir y personalizar' }).click();
  await page.getByRole('button', { name: /^Unica · / }).click();
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
}

/** Espera la tirilla del cliente y devuelve el id y el token de la URL. @param {import('@playwright/test').Page} page */
export async function esperarTirilla(page) {
  await expect(page).toHaveURL(/\/tirilla\/\d+\?token=/);
  const u = new URL(page.url());
  return { id: Number(u.pathname.split('/').pop()), token: /** @type {string} */ (u.searchParams.get('token')) };
}

/**
 * El cliente arma el pedido desde la pantalla: elige el plato, llena el pre-ticket y confirma.
 * Termina en la tirilla y devuelve `{ id, token }`.
 * @param {import('@playwright/test').Page} page
 * @param {{ plato: string, nombre: string, celular?: string, destino?: string }} o
 */
export async function pedirComoCliente(page, o) {
  await page.goto('/');
  await agregarPlato(page, o.plato);
  const ticket = page.locator('aside.tk');
  await ticket.getByLabel('Destino').selectOption(o.destino || 'Recoger en local');
  await ticket.getByLabel('Nombre').fill(o.nombre);
  if (await ticket.getByLabel('Teléfono').count()) await ticket.getByLabel('Teléfono').fill('3001234567');
  if (o.celular) await ticket.getByLabel('Celular para acumular puntos').fill(o.celular);
  await expect(ticket.getByLabel('¿Cómo pagarás?').locator('option', { hasText: 'Efectivo' })).toHaveCount(1); // los métodos de pago cargan aparte
  await ticket.getByRole('button', { name: 'Enviar pedido' }).click();
  await page.getByRole('button', { name: '✅ Confirmar y enviar' }).click();
  return esperarTirilla(page);
}

/** Tarjeta de un pedido en el tablero de cocina. @param {import('@playwright/test').Page} page @param {number} id */
export const tarjetaCocina = (page, id) =>
  page.locator('.tk', { has: page.getByRole('heading', { name: `#${id}`, exact: true }) });

/** Pestaña del panel de cocina. @param {import('@playwright/test').Page} page @param {string} nombre */
export async function pestana(page, nombre) {
  await page.locator('.tabs').getByRole('button', { name: new RegExp(`^${nombre}( [(][0-9]+[)])?$`) }).click();
}

/** Guarda los ajustes con el botón de la pantalla y espera el aviso. @param {import('@playwright/test').Page} page */
export async function guardarAjustes(page) {
  await page.getByRole('button', { name: /Guardar cambios/ }).click();
  await expect(page.getByText('Cambios guardados')).toBeVisible();
}

/** PNG de 1x1 píxel para subir como QR. */
export const PNG_PEQUENO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
