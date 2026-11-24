// @ts-check
import { expect } from '@playwright/test';

/** Usuarios de la base de pruebas (los crea playwright.setup.js) y la clave que se les pone al primer ingreso. */
export const USUARIOS = {
  admin: { usuario: 'admin', inicial: 'Admin-Prueba-123', nueva: 'Cocina-Nueva-2026' },
  ana: { usuario: 'ana', inicial: 'Ana-Prueba-123', nueva: 'Mesera-Nueva-2026' },
  dev: { usuario: 'dev', inicial: 'Dev-Prueba-123', nueva: 'Desarrollo-Nueva-2026' },
};

/**
 * Entra como personal. La primera vez el servidor exige cambiar la clave y se cambia a `nueva`;
 * las siguientes veces se entra directo con `nueva`.
 * @param {import('@playwright/test').Page} page @param {{usuario:string, inicial:string, nueva:string}} u
 */
export async function entrar(page, u) {
  const intentar = async clave => {
    await page.goto('/personal');
    await page.getByLabel('Usuario').fill(u.usuario);
    await page.getByLabel('Contraseña', { exact: true }).fill(clave);
    await page.getByRole('button', { name: 'Entrar' }).click();
    const cambiar = page.getByRole('heading', { name: 'Cambia tu contraseña' });
    const fuera = page.getByRole('heading', { name: 'Acceso del personal' });
    await expect(cambiar.or(page.getByRole('button', { name: /Salir/ }))).toBeVisible().catch(() => {});
    if (await cambiar.isVisible()) return 'cambiar';
    return (await fuera.isVisible()) ? 'fallo' : 'dentro';
  };

  let r = await intentar(u.inicial);
  if (r === 'fallo') r = await intentar(u.nueva);
  if (r === 'cambiar') {
    await page.getByLabel('Contraseña actual').fill(u.inicial);
    await page.getByLabel('Nueva contraseña', { exact: true }).fill(u.nueva);
    await page.getByLabel('Repite la nueva contraseña').fill(u.nueva);
    await page.getByRole('button', { name: 'Guardar y entrar' }).click();
    r = 'dentro';
  }
  expect(r, `no se pudo entrar como ${u.usuario}`).toBe('dentro');
  await expect(page.getByRole('button', { name: /Salir/ })).toBeVisible();
}
