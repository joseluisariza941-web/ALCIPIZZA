// globalSetup de playwright.config.js: reconstruye la base de pruebas de la API en PHP
// (borrar tablas + migraciones + seed de knex) y abre el local las 24 horas.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DB_ENV } from './playwright.config.js';

const server = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server');

export default async function setup() {
  Object.assign(process.env, DB_ENV, {
    DEV_USER: 'dev', DEV_PASS: 'Dev-Prueba-123',
    ADMIN_USER: 'admin', ADMIN_PASS: 'Admin-Prueba-123',
    MESERA_USER: 'ana', MESERA_PASS: 'Ana-Prueba-123',
  });
  const cwd = process.cwd();
  process.chdir(server); // knex resuelve ./migrations y ./seeds desde la carpeta actual
  const knex = createRequire(path.join(server, 'package.json'))('knex');
  const { default: config } = await import(pathToFileURL(path.join(server, 'knexfile.js')).href);
  const db = knex(config);
  try {
    // Borra todas las tablas (la base pudo quedar sin las tablas de knex, p. ej. tras importar deploy/sql).
    // Todo en una misma conexión (transaction) para que FOREIGN_KEY_CHECKS = 0 aplique a los DROP.
    await db.transaction(async trx => {
      const tablas = (await trx.raw('SHOW TABLES'))[0].map(f => Object.values(f)[0]);
      await trx.raw('SET FOREIGN_KEY_CHECKS = 0');
      for (const t of tablas) await trx.schema.dropTableIfExists(t);
      await trx.raw('SET FOREIGN_KEY_CHECKS = 1');
    });
    await db.migrate.latest();
    await db.seed.run();
    await db.raw(
      "UPDATE config SET valor = JSON_SET(valor, '$.h', JSON_ARRAY(JSON_ARRAY(0,24),JSON_ARRAY(0,24),JSON_ARRAY(0,24),JSON_ARRAY(0,24),JSON_ARRAY(0,24),JSON_ARRAY(0,24),JSON_ARRAY(0,24))) WHERE clave = 'general'",
    );
    await db('sessions').del();
    await db('limites').del();
  } finally {
    await db.destroy();
    process.chdir(cwd);
  }
}
