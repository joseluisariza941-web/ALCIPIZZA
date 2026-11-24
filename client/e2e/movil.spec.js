// @ts-check
import { expect, test } from '@playwright/test';

/** El ancho del documento no debe pasarse del de la pantalla (sin scroll horizontal). */
async function sinScrollHorizontal(page) {
  const { ancho, visible } = await page.evaluate(() => ({
    ancho: document.documentElement.scrollWidth,
    visible: document.documentElement.clientWidth,
  }));
  expect(ancho, 'hay scroll horizontal').toBeLessThanOrEqual(visible);
}

test('en celular, el menú se ve completo y sin scroll horizontal', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pizza', exact: true })).toBeVisible();
  await sinScrollHorizontal(page);

  await page.getByRole('button', { name: 'Elegir y personalizar' }).first().click();
  await expect(page.getByRole('button', { name: 'Agregar', exact: true })).toBeVisible();
  await sinScrollHorizontal(page);
});

test('en celular, el acceso del personal cabe en pantalla', async ({ page }) => {
  await page.goto('/personal');
  await expect(page.getByRole('heading', { name: 'Acceso del personal' })).toBeVisible();
  await sinScrollHorizontal(page);
});
