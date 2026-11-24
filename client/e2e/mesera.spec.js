// @ts-check
import { expect, test } from '@playwright/test';
import { entrar, USUARIOS } from './ayuda.js';

test('la mesera toma un pedido para la Mesa 1, cocina lo termina y ella lo cobra', async ({ page, browser }) => {
  await entrar(page, USUARIOS.ana);
  await expect(page).toHaveURL(/\/mesera/);

  await page.getByRole('button', { name: 'Elegir y personalizar' }).first().click();
  await page.getByRole('button', { name: /^Grande · \$38\.000/ }).click();
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await page.getByLabel('Destino').selectOption('Mesa 1');
  await page.getByRole('button', { name: 'Enviar pedido' }).click();
  await page.getByRole('button', { name: '✅ Confirmar y enviar' }).click();

  // Como en la app original, al enviar se abre la tirilla del pedido
  const tirilla = page.getByRole('dialog', { name: /Tirilla del pedido #\d+/ });
  await expect(tirilla).toContainText('$38.000');
  const id = (await tirilla.getAttribute('aria-label'))?.match(/#(\d+)/)?.[1];
  await tirilla.getByRole('button', { name: 'Cerrar' }).click();

  await page.getByRole('button', { name: /^Historial/ }).click();
  const tarjeta = page.locator('.card', { has: page.getByRole('heading', { name: `#${id}`, exact: true }) });
  await expect(tarjeta).toContainText('Mesa 1');
  await expect(tarjeta).toContainText('En deuda'); // no se cobra hasta que cocina lo termine

  // Cocina, en otra sesión, lo prepara y lo finaliza
  const cocina = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
  await entrar(cocina, USUARIOS.admin);
  const ticket = cocina.locator('.tk', { hasText: `#${id}` }).first();
  await ticket.getByRole('button', { name: /Preparar/ }).click();
  await ticket.getByRole('button', { name: /Finalizar/ }).click();
  await cocina.context().close();

  // La mesera lo ve listo (consulta periódica) y cobra
  await expect(tarjeta.getByRole('button', { name: 'Confirmar pago' })).toBeVisible({ timeout: 15_000 });
  await tarjeta.getByRole('button', { name: 'Confirmar pago' }).click();
  await page.getByRole('button', { name: 'Efectivo' }).click();
  await expect(tarjeta).toContainText('Pagado ✓ Efectivo');
});
