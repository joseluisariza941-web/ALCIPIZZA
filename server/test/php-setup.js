// Pruebas contra la API en PHP: reconstruye la base y levanta 3 servidores `php -S`
// (normal, con LOGIN_RATE_MAX=3 y con PEDIDOS_WEB_MAX=2).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setup as base } from './global-setup.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../php-api');
const hijos = [];

async function esperar(url) {
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* aún no */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`PHP no respondió en ${url}`);
}

export async function setup(ctx) {
  await base(ctx);
  const env = ctx.config.env;
  const b = Number(env.ALCI_PORT_BASE || 3100);
  const servidores = [[b + 1, {}], [b + 2, { LOGIN_RATE_MAX: '3' }], [b + 3, { PEDIDOS_WEB_MAX: '2' }]];
  for (const [puerto, extra] of servidores) {
    const p = spawn('php', ['-S', `127.0.0.1:${puerto}`, '-t', 'public', 'public/dev-router.php'], {
      cwd: raiz, stdio: ['ignore', 'ignore', 'pipe'],
      env: {
        ...process.env, ...env, APP_ENV: 'test', ALCI_ENV_FILE: path.join(raiz, '.env.test-inexistente'),
        DB_HOST: process.env.DB_HOST || '127.0.0.1', DB_PORT: process.env.DB_PORT || '3310',
        DB_USER: process.env.DB_USER || 'alcipizza', DB_PASSWORD: process.env.DB_PASSWORD || 'Alcipizza_Dev_2026',
        LOGIN_RATE_MAX: '1000', PEDIDOS_WEB_MAX: '1000', PHP_CLI_SERVER_WORKERS: '4', ...extra,
      },
    });
    p.stderr.on('data', d => {
      const s = String(d);
      if (/PHP (Fatal|Warning|Parse|Notice|Deprecated)|\[alcipizza\]/.test(s)) process.stderr.write(`[php ${puerto}] ${s}`);
    });
    hijos.push(p);
  }
  await Promise.all(servidores.map(([p]) => esperar(`http://127.0.0.1:${p}/api/health`)));
}

export async function teardown() {
  for (const p of hijos) p.kill();
}
