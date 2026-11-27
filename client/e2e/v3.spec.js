// @ts-check
// Flujos de la v3 en el navegador: editar/cancelar desde la tirilla, domicilios, promociones, puntos,
// eliminar y restaurar, reiniciar reportes y QR de pago. Cada prueba crea sus propios platos y pedidos
// (nombres únicos) y deja los ajustes como estaban.
import { expect, test } from '@playwright/test';
import { USUARIOS } from './ayuda.js';
import {
  agregarPlato, ajustar, apiCliente, apiCocina, celularUnico, clienteApi, crearPlato, esperarTirilla, guardarAjustes,
  iniciarSesion, pedidoWebApi, pedirComoCliente, PNG_PEQUENO, pestana, quitarPlato, sesionCocina, tarjetaCocina,
  tarjetaPlato, unico,
} from './ayuda-v3.js';

/** Solo los dígitos de un texto en pesos ("$16.000" -> 16000). @param {string} t */
const numero = t => Number(t.replace(/\D/g, ''));

/** Cocina lleva un pedido de nuevo a listo desde el tablero. @param {import('@playwright/test').Page} page @param {number} id */
async function prepararYFinalizar(page, id) {
  const t = tarjetaCocina(page, id);
  await t.getByRole('button', { name: /Preparar/ }).click();
  await t.getByRole('button', { name: /Finalizar/ }).click();
  await expect(t.getByRole('button', { name: 'Confirmar pago' })).toBeVisible();
}

/** Ids de lo que cada prueba crea, para limpiarlo al final. @returns {{platos:number[], pedidos:number[], promos:string[]}} */
const nuevoRastro = () => ({ platos: [], pedidos: [], promos: [] });

/** Oculta los platos, cancela los pedidos aún abiertos y borra las promociones de la prueba. */
async function limpiar(api, rastro) {
  for (const id of rastro.pedidos) await api.patch(`/api/pedidos/${id}/estado`, { estado: 'cancelado' });
  const promos = (await api.get('/api/promociones')).datos || [];
  for (const p of promos) if (rastro.promos.includes(p.nombre)) await api.del(`/api/promociones/${p.id}`);
  for (const id of rastro.platos) await quitarPlato(api, id);
}

test.describe('v3', () => {
  /** @type {Awaited<ReturnType<typeof apiCocina>>} */
  let cocina;
  /** @type {ReturnType<typeof nuevoRastro>} */
  let rastro;

  test.beforeEach(async ({ playwright, baseURL }) => {
    test.setTimeout(120_000); // la carga de cada página tarda varios segundos con el servidor de PHP
    cocina = await apiCocina(playwright, /** @type {string} */ (baseURL));
    rastro = nuevoRastro();
  });

  test.afterEach(async () => {
    await limpiar(cocina, rastro);
    await cocina.ctx.dispose();
  });

  test('1. el cliente edita su pedido nuevo desde la tirilla y cocina lo ve como editado', async ({ page, browser }) => {
    const s = unico();
    const a = await crearPlato(cocina, `Plato A ${s}`, 10000);
    const b = await crearPlato(cocina, `Plato B ${s}`, 7000);
    rastro.platos.push(a.id, b.id);

    const { id, token } = await pedirComoCliente(page, { plato: a.nombre, nombre: `Edita ${s}` });
    rastro.pedidos.push(id);
    await expect(page.getByText(a.nombre)).toBeVisible();

    // Desde la tirilla: Editar pedido vuelve al menú con el pedido cargado
    await page.getByRole('button', { name: 'Editar pedido' }).click();
    await expect(page).toHaveURL('/');
    const ticket = page.locator('aside.tk');
    await expect(ticket).toContainText(a.nombre);
    await expect(ticket.getByLabel('Nombre')).toHaveValue(`Edita ${s}`);
    await ticket.getByRole('button', { name: 'Quitar' }).click();
    await agregarPlato(page, b.nombre);
    await expect(ticket).toContainText('$7.000');
    await expect(ticket.getByLabel('¿Cómo pagarás?').locator('option', { hasText: 'Efectivo' })).toHaveCount(1); // los métodos de pago cargan aparte
    await ticket.getByRole('button', { name: 'Enviar pedido' }).click();
    await page.getByRole('button', { name: '✅ Confirmar y enviar' }).click();

    // Mismo pedido y mismo token, con los ítems nuevos
    await expect(page).toHaveURL(new RegExp(`/tirilla/${id}\\?token=`));
    await expect(page.getByText(b.nombre)).toBeVisible();
    await expect(page.getByText(a.nombre)).toHaveCount(0);
    expect((await esperarTirilla(page)).token).toBe(token);

    // Cocina, en otra sesión, ve el cambio con su etiqueta
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const c = await ctx.newPage();
    await sesionCocina(c);
    await c.goto('/cocina');
    const t = tarjetaCocina(c, id);
    await expect(t).toContainText('Editado por el cliente');
    await expect(t).toContainText(b.nombre);
    await expect(t).not.toContainText(a.nombre);
    await expect(t).toContainText('$7.000');
    await ctx.close();
  });

  test('1b. el cliente cancela su pedido y la mesera lo ve como cancelado por el cliente', async ({ page, browser, playwright, baseURL }) => {
    const s = unico();
    const a = await crearPlato(cocina, `Plato C ${s}`, 9000);
    rastro.platos.push(a.id);
    const cliente = await apiCliente(playwright, /** @type {string} */ (baseURL));
    const { id, token } = await pedidoWebApi(cliente, a, { cliente: `Cancela ${s}` });

    await page.goto(`/tirilla/${id}?token=${token}`);
    await expect(page.getByText(`PEDIDO #${id}`)).toBeVisible();
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Cancelar pedido' }).click();
    await expect(page.getByText('❌ Pedido cancelado')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Editar pedido' })).toHaveCount(0);

    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const m = await ctx.newPage();
    await iniciarSesion(clienteApi(m.request), USUARIOS.ana);
    await m.goto('/mesera');
    await m.getByRole('button', { name: /^Historial/ }).click();
    const tarjeta = m.locator('.card', { has: m.getByRole('heading', { name: `#${id}`, exact: true }) });
    await expect(tarjeta).toContainText('Cancelado por el cliente');
    await ctx.close();
    await cliente.ctx.dispose();
  });

  test('1c. un pedido que cocina ya aceptó no muestra Cancelar ni Editar', async ({ page, playwright, baseURL }) => {
    const s = unico();
    const a = await crearPlato(cocina, `Plato D ${s}`, 8000);
    rastro.platos.push(a.id);
    const cliente = await apiCliente(playwright, /** @type {string} */ (baseURL));
    const { id, token } = await pedidoWebApi(cliente, a, { cliente: `Aceptado ${s}` });
    rastro.pedidos.push(id);

    // Mientras está nuevo, ambas opciones están
    await page.goto(`/tirilla/${id}?token=${token}`);
    await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Editar pedido' })).toBeVisible();

    // Cocina lo acepta; la tirilla, al consultarse de nuevo, ya no las ofrece
    expect((await cocina.patch(`/api/pedidos/${id}/estado`, { estado: 'preparando' })).ok).toBe(true);
    await page.reload();
    await expect(page.getByText(`PEDIDO #${id}`)).toBeVisible();
    await expect(page.getByText('Preparando')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Editar pedido' })).toHaveCount(0);
  });

  test('2. al apagar los domicilios el cliente no los ve, y al encenderlos vuelven', async ({ page, context }) => {
    try {
      await sesionCocina(page);
      await page.goto('/cocina/ajustes');
      const check = page.getByLabel('Domicilios activos');
      await expect(check).toBeChecked();
      await check.uncheck();
      await guardarAjustes(page);

      const cliente = await context.newPage();
      await cliente.goto('/');
      const destino = cliente.locator('aside.tk').getByLabel('Destino');
      await expect(destino).toBeVisible();
      await expect(destino.locator('option', { hasText: 'Domicilio' })).toHaveCount(0);
      await expect(cliente.getByText('Por ahora no tenemos domicilios.')).toBeVisible();

      await check.check();
      await guardarAjustes(page);
      await cliente.reload();
      await expect(cliente.locator('aside.tk').getByLabel('Destino').locator('option', { hasText: 'Domicilio' })).toHaveCount(1);
      await expect(cliente.getByText('Por ahora no tenemos domicilios.')).toHaveCount(0);
    } finally {
      await ajustar(cocina, { domiciliosActivos: true });
    }
  });

  test('3. una promoción de porcentaje sobre un plato se ve tachada en el menú y el total cotizado es el del pedido', async ({ page, browser }) => {
    const s = unico();
    const a = await crearPlato(cocina, `Plato P ${s}`, 20000);
    rastro.platos.push(a.id);
    const promo = `Promo ${s}`;
    rastro.promos.push(promo);
    const dia = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

    await sesionCocina(page);
    await page.goto('/cocina/promociones');
    await page.getByRole('button', { name: '+ Nueva promoción' }).click();
    const form = page.getByRole('dialog', { name: 'Nueva promoción' });
    await form.getByLabel('Nombre').fill(promo);
    await form.getByLabel('Porcentaje', { exact: true }).fill('20');
    await form.getByLabel('Aplica a').selectOption('plato');
    await form.locator('label', { hasText: /^Plato/ }).locator('select').selectOption({ label: a.nombre });
    await form.getByLabel('Fecha de inicio').fill(dia(-1));
    await form.getByLabel('Fecha de fin').fill(dia(2));
    await form.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText(promo).first()).toBeVisible();

    // El cliente usa su propio navegador: con la sesión de cocina el pedido sería del personal (sin tirilla).
    const cliente = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
    await cliente.goto('/');
    const tarjeta = tarjetaPlato(cliente, a.nombre);
    await expect(tarjeta.locator('.pl s')).toHaveText('$20.000');
    await expect(tarjeta.locator('.pl b')).toHaveText('$16.000');
    await expect(tarjeta).toContainText(promo);

    await agregarPlato(cliente, a.nombre);
    const ticket = cliente.locator('aside.tk');
    await expect(ticket).toContainText('Descuento promoción');
    await expect(ticket).toContainText('-$4.000');
    const cotizado = numero(await ticket.locator('p.r', { has: cliente.locator('b', { hasText: /^Total$/ }) }).locator('b').last().innerText());
    expect(cotizado).toBe(16000);

    await ticket.getByLabel('Destino').selectOption('Recoger en local');
    await ticket.getByLabel('Nombre').fill(`Promo ${s}`);
    await ticket.getByLabel('Teléfono').fill('3001234567');
    await ticket.getByRole('button', { name: 'Enviar pedido' }).click();
    await expect(cliente.getByRole('heading', { name: '¿Confirmas el pedido?' })).toBeVisible();
    await expect(cliente.getByText('Descuento promoción').last()).toBeVisible();
    await cliente.getByRole('button', { name: '✅ Confirmar y enviar' }).click();
    const { id, token } = await esperarTirilla(cliente);
    rastro.pedidos.push(id);

    const guardado = (await cliente.request.get(`/api/pedidos/${id}?token=${encodeURIComponent(token)}`));
    const p = await guardado.json();
    expect(guardado.status(), JSON.stringify(p)).toBe(200);
    expect(p.total).toBe(cotizado);
    expect(p.subtotal).toBe(20000);
    expect(p.descuentoPromo).toBe(4000);
    expect(p.promocion?.nombre).toBe(promo);
    await expect(cliente.getByText('$16.000').first()).toBeVisible();
  });

  test('4. puntos: se ganan al cobrar, se consultan y se canjean en caja bajando total y saldo', async ({ page, browser }) => {
    test.setTimeout(240_000);
    const s = unico();
    const grande = await crearPlato(cocina, `Plato G ${s}`, 50000);
    const chico = await crearPlato(cocina, `Plato H ${s}`, 5000);
    rastro.platos.push(grande.id, chico.id);
    const celular = celularUnico();
    try {
      // Ajustes activa los puntos: 10 por cada $1.000; 100 puntos = $1.000
      await sesionCocina(page);
      await page.goto('/cocina/ajustes');
      await page.getByLabel('Activar puntos').check();
      await page.getByLabel('Puntos por cada $1.000').fill('10');
      await page.getByLabel('Puntos por canje').fill('100');
      await page.getByLabel('Descuento por canje ($)').fill('1000');
      await guardarAjustes(page);

      const ctx = await browser.newContext({ reducedMotion: 'reduce' });
      const cliente = await ctx.newPage();

      // Pedido 1: $50.000 con celular; cocina cobra y el cliente ve sus puntos
      const p1 = await pedirComoCliente(cliente, { plato: grande.nombre, nombre: `Puntos ${s}`, celular });
      rastro.pedidos.push(p1.id);
      await page.goto('/cocina');
      await prepararYFinalizar(page, p1.id);
      await tarjetaCocina(page, p1.id).getByRole('button', { name: 'Confirmar pago' }).click();
      await page.getByRole('dialog', { name: `Cobrar pedido #${p1.id}` }).getByRole('button', { name: 'Efectivo' }).click();
      await expect(tarjetaCocina(page, p1.id).getByText(/Pagado/)).toBeVisible();

      await expect(cliente.getByText('Ganaste 500 puntos')).toBeVisible({ timeout: 15_000 });
      await cliente.goto('/');
      await cliente.locator('aside.tk').getByLabel('Celular para acumular puntos').fill(celular);
      await cliente.getByRole('button', { name: 'Consultar mis puntos' }).click();
      await expect(cliente.locator('aside.tk')).toContainText('Tienes 500 puntos');

      // Pedido 2: $5.000; en caja canjea 2 canjes (200 puntos = $2.000)
      const p2 = await pedirComoCliente(cliente, { plato: chico.nombre, nombre: `Canje ${s}`, celular });
      rastro.pedidos.push(p2.id);
      await page.goto('/cocina');
      await prepararYFinalizar(page, p2.id);
      await tarjetaCocina(page, p2.id).getByRole('button', { name: 'Confirmar pago' }).click();
      const cobro = page.getByRole('dialog', { name: `Cobrar pedido #${p2.id}` });
      await expect(cobro).toContainText('$5.000');
      await cobro.getByRole('button', { name: 'Ver puntos' }).click();
      await expect(cobro).toContainText('Saldo: 500 puntos');
      await cobro.getByLabel('Canjes a aplicar').selectOption('2');
      await expect(cobro).toContainText('Descuento por puntos: -$2.000');
      await expect(cobro).toContainText('Total a cobrar: $3.000');
      await cobro.getByRole('button', { name: 'Efectivo' }).click();
      await expect(cobro).toContainText('Total cobrado: $3.000');
      await cobro.getByRole('button', { name: 'Listo' }).click();

      const pagado = await (await cliente.request.get(`/api/pedidos/${p2.id}?token=${encodeURIComponent(p2.token)}`)).json();
      expect(pagado).toMatchObject({ total: 3000, puntosCanjeados: 200, descuentoPuntos: 2000, pagoEstado: 'pagado' });

      // Saldo: 500 - 200 canjeados + 30 ganados sobre el total final ($3.000) = 330
      await cliente.goto('/');
      await cliente.locator('aside.tk').getByLabel('Celular para acumular puntos').fill(celular);
      await cliente.getByRole('button', { name: 'Consultar mis puntos' }).click();
      await expect(cliente.locator('aside.tk')).toContainText('Tienes 330 puntos');
      await ctx.close();
    } finally {
      await ajustar(cocina, { puntosActivos: false, puntosPorMil: 1, puntosCanje: 100, descuentoCanje: 1000 });
    }
  });

  test('5. eliminar un plato lo saca del menú del cliente; en "Ver eliminados" se restaura y vuelve', async ({ page, context }) => {
    const s = unico();
    const a = await crearPlato(cocina, `Plato E ${s}`, 11000);
    rastro.platos.push(a.id);

    const cliente = await context.newPage();
    await cliente.goto('/');
    await expect(tarjetaPlato(cliente, a.nombre)).toBeVisible();

    await sesionCocina(page);
    await page.goto('/cocina/comidas');
    const fila = page.getByRole('row').filter({ has: page.getByText(a.nombre, { exact: true }) });
    page.once('dialog', d => d.accept());
    await fila.getByRole('button', { name: 'Eliminar' }).click({ timeout: 8000 });
    await expect(page.getByText(a.nombre, { exact: true })).toHaveCount(0);

    await cliente.reload();
    await expect(cliente.getByRole('heading', { name: 'Pizza', exact: true })).toBeVisible();
    await expect(tarjetaPlato(cliente, a.nombre)).toHaveCount(0);

    await page.getByRole('button', { name: 'Ver eliminados' }).click();
    const eliminada = page.getByRole('row').filter({ has: page.getByText(a.nombre, { exact: true }) });
    await expect(eliminada).toBeVisible();
    await eliminada.getByRole('button', { name: 'Restaurar' }).click();
    // Sale de "Ver eliminados" y vuelve a la tabla principal de Comidas.
    await expect(eliminada.getByRole('button', { name: 'Restaurar' })).toHaveCount(0);
    await expect(eliminada.getByRole('button', { name: 'Eliminar' })).toBeVisible();

    await cliente.reload();
    await expect(tarjetaPlato(cliente, a.nombre)).toBeVisible();
  });

  test('6. reiniciar reportes archiva lo cerrado, deja lo en curso y el histórico sigue disponible', async ({ page, playwright, baseURL }) => {
    test.setTimeout(240_000);
    const s = unico();
    const cerrado = await crearPlato(cocina, `Plato Z ${s}`, 12345);
    const abierto = await crearPlato(cocina, `Plato Y ${s}`, 6789);
    rastro.platos.push(cerrado.id, abierto.id);
    const cliente = await apiCliente(playwright, /** @type {string} */ (baseURL));

    // Un pedido cerrado (entregado y pagado) y otro en curso
    const c = await pedidoWebApi(cliente, cerrado, { cliente: `Cerrado ${s}` });
    for (const estado of ['preparando', 'listo', 'entregado']) {
      expect((await cocina.patch(`/api/pedidos/${c.id}/estado`, { estado })).ok).toBe(true);
    }
    expect((await cocina.post(`/api/pedidos/${c.id}/pago`, { metodoPago: 'ef' })).ok).toBe(true);
    const o = await pedidoWebApi(cliente, abierto, { cliente: `Abierto ${s}` });
    rastro.pedidos.push(o.id);

    const ventasPorPlato = page.locator('.card', { has: page.getByRole('heading', { name: 'Ventas por plato' }) });
    const celdaPlato = (/** @type {string} */ n) => ventasPorPlato.getByRole('cell', { name: n, exact: true });

    await sesionCocina(page);
    await page.goto('/cocina/reporte');
    await expect(celdaPlato(cerrado.nombre)).toBeVisible();
    await expect(celdaPlato(abierto.nombre)).toBeVisible();

    // El aviso pide escribir BORRAR
    await pestana(page, 'Ajustes');
    await page.getByRole('button', { name: 'Reiniciar reportes' }).click();
    const aviso = page.getByRole('dialog', { name: 'Reiniciar reportes' });
    await expect(aviso).toContainText('BORRAR');
    await expect(aviso).toContainText('No se pierde nada');
    const confirmar = aviso.getByRole('button', { name: 'Reiniciar reportes' });
    await expect(confirmar).toBeDisabled();
    await aviso.getByLabel('Escribe BORRAR para confirmar').fill('borrar');
    await expect(confirmar).toBeDisabled();
    await aviso.getByLabel('Escribe BORRAR para confirmar').fill('BORRAR');
    await expect(confirmar).toBeEnabled();
    await confirmar.click();
    await expect(aviso).toContainText('Reportes reiniciados');
    await aviso.getByRole('button', { name: 'Cerrar' }).click();

    // Lo que está en curso sigue en cocina
    await pestana(page, 'Pedidos');
    await expect(tarjetaCocina(page, o.id)).toContainText(abierto.nombre);

    // El reporte del periodo ya no cuenta lo cerrado; con "Todo el histórico" vuelve
    await pestana(page, 'Reporte');
    await expect(celdaPlato(abierto.nombre)).toBeVisible();
    await expect(celdaPlato(cerrado.nombre)).toHaveCount(0);
    await page.getByLabel('Archivados').selectOption({ label: 'Todo el histórico' });
    await expect(celdaPlato(cerrado.nombre)).toBeVisible();
    await expect(celdaPlato(abierto.nombre)).toBeVisible();
    await page.getByLabel('Archivados').selectOption({ label: 'Solo archivado' });
    await expect(celdaPlato(cerrado.nombre)).toBeVisible();
    await expect(celdaPlato(abierto.nombre)).toHaveCount(0);

    // Las facturas siguen viendo lo archivado con su filtro
    await page.getByRole('button', { name: 'Facturas', exact: true }).click();
    await page.getByLabel('Buscar factura').fill(`Cerrado ${s}`);
    const factura = page.getByRole('row').filter({ hasText: `#${c.id}` });
    await expect(factura).toHaveCount(1); // "Solo archivado"
    await page.getByLabel('Archivados').selectOption({ label: 'Periodo actual' });
    await expect(page.getByText('Sin facturas')).toBeVisible();
    await page.getByLabel('Archivados').selectOption({ label: 'Todo el histórico' });
    await expect(factura).toHaveCount(1);
    await factura.getByRole('button', { name: 'Ver factura' }).click();
    await expect(page.getByText(`PEDIDO #${c.id}`)).toBeVisible();
    await expect(page.getByText(cerrado.nombre).last()).toBeVisible();
    await cliente.ctx.dispose();
  });

  test('7. el QR que cocina sube a un método de pago lo ve el cliente al elegirlo', async ({ page, context }) => {
    try {
      await sesionCocina(page);
      await page.goto('/cocina/ajustes');
      await page.getByLabel('Subir QR de Nequi').setInputFiles({ name: 'qr.png', mimeType: 'image/png', buffer: PNG_PEQUENO });
      await expect(page.getByRole('img', { name: 'QR de Nequi' })).toBeVisible();

      const cliente = await context.newPage();
      await cliente.goto('/');
      const ticket = cliente.locator('aside.tk');
      await ticket.getByLabel('¿Cómo pagarás?').selectOption({ label: 'Nequi' });
      const qr = ticket.getByRole('img', { name: 'QR de pago Nequi' });
      await expect(qr).toBeVisible();
      expect(await qr.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
      await ticket.getByLabel('¿Cómo pagarás?').selectOption({ label: 'Efectivo' });
      await expect(ticket.getByRole('img', { name: /QR de pago/ })).toHaveCount(0);
    } finally {
      const r = await cocina.put('/api/metodos-pago/nq', { qrUrl: null });
      expect(r.ok).toBe(true);
    }
  });
});
