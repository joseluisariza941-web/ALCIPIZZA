// @ts-check
import { expect, test } from '@playwright/test';
import { entrar, USUARIOS } from './ayuda.js';

// Recorrido completo contra la API en PHP y MySQL (base de pruebas reconstruida por playwright.setup.js).
test.describe.configure({ mode: 'serial' });

test('el cliente arma un pedido, lo confirma y ve su tirilla con el precio del servidor', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pizza', exact: true })).toBeVisible();

  // Pizza mediana + un extra
  await page.getByRole('button', { name: 'Elegir y personalizar' }).first().click();
  await page.getByRole('button', { name: /^Mediana · \$28\.000/ }).click();
  await page.getByPlaceholder('Nota (ej: bien asada)').fill('bien asada');
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();

  const ticket = page.locator('aside.tk');
  await expect(ticket).toContainText('Pizza');
  await expect(ticket).toContainText('$28.000');

  await ticket.getByLabel('Destino').selectOption('Recoger en local');
  await ticket.getByLabel('Nombre').fill('Laura E2E');
  if (await ticket.getByLabel('Teléfono').count()) await ticket.getByLabel('Teléfono').fill('3001234567');
  await ticket.getByRole('button', { name: 'Enviar pedido' }).click();

  await expect(page.getByRole('heading', { name: '¿Confirmas el pedido?' })).toBeVisible();
  await page.getByRole('button', { name: '✅ Confirmar y enviar' }).click();

  await expect(page).toHaveURL(/\/tirilla\/\d+\?token=/);
  await expect(page.getByText('Laura E2E').first()).toBeVisible();
  await expect(page.getByText('$28.000').first()).toBeVisible();
});

test('sin sesión, /cocina lleva al acceso del personal; una clave errada no deja entrar', async ({ page }) => {
  await page.goto('/cocina');
  await expect(page.getByRole('heading', { name: 'Acceso del personal' })).toBeVisible();
  await page.getByLabel('Usuario').fill('admin');
  await page.getByLabel('Contraseña', { exact: true }).fill('clave-equivocada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText(/incorrect/i).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Acceso del personal' })).toBeVisible();
});

test('cocina cambia la clave obligatoria, ve el pedido web y lo pasa a preparación', async ({ page }) => {
  await entrar(page, USUARIOS.admin);
  await expect(page).toHaveURL(/\/cocina/);
  await expect(page.getByText('Laura E2E').first()).toBeVisible();

  await page.getByRole('button', { name: /Preparar/ }).first().click();
  await expect(page.getByRole('button', { name: /Finalizar/ }).first()).toBeVisible();

  // Salir cierra la sesión: /cocina vuelve a pedir acceso
  await page.getByRole('button', { name: /Salir/ }).click();
  await page.goto('/cocina');
  await expect(page.getByRole('heading', { name: 'Acceso del personal' })).toBeVisible();
});
