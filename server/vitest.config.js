import { defineConfig } from 'vitest/config';

// Pruebas de la API en PHP (php-api/) por HTTP. Usan una base aparte que se reconstruye en cada corrida.
// ALCI_TEST_DB / ALCI_PORT_BASE permiten correr varias copias en paralelo sin chocar.
export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './test/php-setup.js',
    fileParallelism: false, // todas comparten la misma base de pruebas
    testTimeout: 20000,
    env: {
      NODE_ENV: 'test',
      BCRYPT_ROUNDS: '4',
      DB_NAME: process.env.ALCI_TEST_DB || 'alcipizza_test',
      ALCI_PORT_BASE: process.env.ALCI_PORT_BASE || '3100',
      DEV_USER: 'dev', DEV_PASS: 'Dev-Prueba-123',
      ADMIN_USER: 'admin', ADMIN_PASS: 'Admin-Prueba-123',
      MESERA_USER: 'ana', MESERA_PASS: 'Ana-Prueba-123',
    },
  },
});
