import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 3600;
const aqui = path.dirname(fileURLToPath(import.meta.url));

/** Base de pruebas de la API en PHP (también la usa playwright.setup.js para reconstruirla). */
export const DB_ENV = {
  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_PORT: process.env.DB_PORT || '3310',
  DB_NAME: process.env.ALCI_E2E_DB || 'alcipizza_test_d',
  DB_USER: process.env.DB_USER || 'alcipizza',
  DB_PASSWORD: process.env.DB_PASSWORD || 'Alcipizza_Dev_2026',
};

/** Pruebas E2E: React compilado + API en PHP (php -S + dev-router.php) + MySQL de pruebas (se reconstruye en cada corrida). */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './playwright.setup.js',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    contextOptions: { reducedMotion: 'reduce' }, // styles.css apaga las animaciones con esto
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Los flujos cambian datos (claves, pedidos): corren una sola vez, en escritorio.
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] }, testIgnore: /movil\.spec/ },
    { name: 'celular', use: { ...devices['Pixel 7'] }, testMatch: /movil\.spec/ },
  ],
  webServer: {
    command: `npm run build && php -S 127.0.0.1:${PORT} -t ../php-api/public ../php-api/public/dev-router.php`,
    url: `http://127.0.0.1:${PORT}/`, // no /api/health: la base se reconstruye después, en globalSetup
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      ...DB_ENV,
      ALCI_DIST: path.join(aqui, 'dist'),
      ALCI_ENV_FILE: path.join(aqui, '../php-api/.env.e2e-inexistente'), // no leer php-api/.env
      APP_ENV: 'test',
      BCRYPT_ROUNDS: '4',
      LOGIN_RATE_MAX: '1000',
      PEDIDOS_WEB_MAX: '1000',
    },
  },
});
