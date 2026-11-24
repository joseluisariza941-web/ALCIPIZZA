#!/usr/bin/env node
// Arma la carpeta deploy/ (raíz del repo) para subir Alcipizza a Hostinger (PHP + MariaDB/MySQL).
//
//   node php-api/scripts/build-deploy.mjs [--no-build] [--no-sql]
//
//   --no-build  usa client/dist tal como está (no corre `npm run build`)
//   --no-sql    no regenera deploy/sql (deja la que haya)
//
// Resultado:
//   deploy/public_html/          build de React + index.php + .htaccess      → ~/domains/<dominio>/public_html
//   deploy/alcipizza-api/        src/ + scripts/crear-usuarios.php + .env.example → ~/domains/<dominio>/alcipizza-api
//   deploy/sql/schema.sql        estructura (desde las migraciones de knex), compatible con MariaDB
//   deploy/sql/seed.sql          datos iniciales (menú, insumos, ajustes…) sin usuarios ni sesiones
//   deploy/README-DEPLOY.md      pasos
//
// Para el SQL usa el MySQL de docker-compose (contenedor alcipizza-mysql) y una base de trabajo que se BORRA
// y se vuelve a crear: ALCI_SQL_DB (por defecto alcipizza_test_d). Variables opcionales: ALCI_MYSQL_CONTAINER,
// MYSQL_ROOT_PASSWORD, DB_PORT, DB_USER, DB_PASSWORD.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const r = (...p) => path.join(raiz, ...p);
const salida = r('deploy');
const win = process.platform === 'win32';

function correr(cmd, argv, opts = {}) {
  console.log(`$ ${cmd} ${argv.join(' ').replace(/MYSQL_PWD=\S+/g, 'MYSQL_PWD=***')}`);
  return execFileSync(cmd, argv, { stdio: opts.capturar ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, shell: win && !opts.sinShell, ...opts });
}

// 1. Build del cliente
if (!args.has('--no-build')) correr('npm', ['run', 'build'], { cwd: r('client') });
if (!existsSync(r('client/dist/index.html'))) throw new Error('No existe client/dist/index.html: corre el build primero');

// 2. Carpetas (se rehacen desde cero)
for (const d of ['public_html', 'alcipizza-api', 'README-DEPLOY.md']) rmSync(path.join(salida, d), { recursive: true, force: true });
mkdirSync(path.join(salida, 'alcipizza-api/scripts'), { recursive: true });

cpSync(r('client/dist'), path.join(salida, 'public_html'), { recursive: true });
cpSync(r('php-api/public/index.php'), path.join(salida, 'public_html/index.php'));
cpSync(r('php-api/public/.htaccess'), path.join(salida, 'public_html/.htaccess'));
cpSync(r('php-api/src'), path.join(salida, 'alcipizza-api/src'), { recursive: true });
cpSync(r('php-api/scripts/crear-usuarios.php'), path.join(salida, 'alcipizza-api/scripts/crear-usuarios.php'));
cpSync(r('docs/DESPLIEGUE.md'), path.join(salida, 'README-DEPLOY.md'));
writeFileSync(path.join(salida, 'alcipizza-api/.env.example'), `# Copia este archivo como .env en ~/domains/<dominio>/alcipizza-api/.env  (fuera de public_html)
# Datos de la base que creaste en hPanel → Bases de datos → MySQL (el nombre y el usuario llevan el prefijo u123456789_).
DB_HOST=localhost
DB_PORT=3306
DB_NAME=u000000000_alcipizza
DB_USER=u000000000_alcipizza
DB_PASSWORD=cambia-esta-clave

# production: cookie Secure + HSTS. No cambiar en el servidor.
APP_ENV=production

# Costo de bcrypt para las claves nuevas (12 recomendado).
BCRYPT_ROUNDS=12

# Opcionales: límites por IP (intentos de login / pedidos web por ventana). Déjalos comentados para usar los de la app.
# LOGIN_RATE_MAX=10
# PEDIDOS_WEB_MAX=20
`);

// 3. SQL
if (!args.has('--no-sql')) generarSql();

console.log(`\nListo: ${salida}`);

function generarSql() {
  const contenedor = process.env.ALCI_MYSQL_CONTAINER || 'alcipizza-mysql';
  const base = process.env.ALCI_SQL_DB || 'alcipizza_test_d';
  if (!/^[A-Za-z0-9_]+$/.test(base)) throw new Error(`Nombre de base inválido: ${base}`);
  const rootPw = process.env.MYSQL_ROOT_PASSWORD
    || correr('docker', ['exec', contenedor, 'printenv', 'MYSQL_ROOT_PASSWORD'], { capturar: true, sinShell: true }).trim();
  const dbUser = process.env.DB_USER || 'alcipizza';
  const dbPass = process.env.DB_PASSWORD || 'Alcipizza_Dev_2026';
  const mysql = (sql) => correr('docker', ['exec', '-e', `MYSQL_PWD=${rootPw}`, contenedor, 'mysql', '-uroot', '-e', sql], { sinShell: true });

  // Base de trabajo limpia → migraciones + seed de knex (los usuarios del seed no se exportan)
  mysql(`DROP DATABASE IF EXISTS \`${base}\`; CREATE DATABASE \`${base}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; `
    + `GRANT ALL PRIVILEGES ON \`${base}\`.* TO '${dbUser}'@'%';`);
  const env = { ...process.env, DB_HOST: '127.0.0.1', DB_PORT: process.env.DB_PORT || '3310', DB_NAME: base,
    DB_USER: dbUser, DB_PASSWORD: dbPass, DEV_PASS: 'x-no-se-exporta', ADMIN_PASS: 'x-no-se-exporta', MESERA_PASS: 'x-no-se-exporta' };
  correr('npx', ['knex', '--knexfile', 'knexfile.js', 'migrate:latest'], { cwd: r('server'), env });
  correr('npx', ['knex', '--knexfile', 'knexfile.js', 'seed:run'], { cwd: r('server'), env });

  const dump = (extra) => correr('docker', ['exec', '-e', `MYSQL_PWD=${rootPw}`, contenedor, 'mysqldump', '-uroot',
    '--compact', '--skip-tz-utc', '--no-tablespaces', '--set-gtid-purged=OFF', '--default-character-set=utf8mb4',
    ...extra], { capturar: true, sinShell: true });

  const sinTablas = ['knex_migraciones', 'knex_migraciones_lock'];
  const esquema = dump(['--no-data', '--skip-triggers', base, ...sinTablas.flatMap(t => ['--ignore-table', `${base}.${t}`])]);
  const datos = dump(['--no-create-info', '--complete-insert', '--skip-triggers', '--hex-blob', base,
    ...[...sinTablas, 'usuarios', 'sessions', 'limites'].flatMap(t => ['--ignore-table', `${base}.${t}`])]);

  const cabecera = (titulo) => `-- Alcipizza · ${titulo}
-- Generado por php-api/scripts/build-deploy.mjs el ${new Date().toISOString()} desde server/migrations (knex).
-- Compatible con MySQL 8 y MariaDB 10.4+. Importar en una base vacía (phpMyAdmin → Importar, o mysql < archivo).
SET NAMES utf8mb4;
SET time_zone = '-05:00';
SET FOREIGN_KEY_CHECKS = 0;
`;
  const pie = '\nSET FOREIGN_KEY_CHECKS = 1;\n';

  const sqlEsquema = cabecera('estructura (schema.sql)') + '\n' + limpiar(esquema)
    .replace(/ AUTO_INCREMENT=\d+/g, '') + pie;
  const sqlDatos = cabecera('datos iniciales (seed.sql) — sin usuarios: créalos con crear-usuarios.php')
    + '\n' + limpiar(datos) + pie;

  for (const t of ['sessions', 'limites', 'usuarios', 'platos', 'pedidos']) {
    if (!new RegExp(`CREATE TABLE \`${t}\``).test(sqlEsquema)) throw new Error(`schema.sql no tiene la tabla ${t}`);
  }
  if (/usuarios|`sessions`/.test(sqlDatos.replace(/^--.*$/gm, ''))) throw new Error('seed.sql no debe tener usuarios ni sesiones');

  mkdirSync(path.join(salida, 'sql'), { recursive: true });
  writeFileSync(path.join(salida, 'sql/schema.sql'), sqlEsquema);
  writeFileSync(path.join(salida, 'sql/seed.sql'), sqlDatos);
  console.log(`· schema.sql: ${(sqlEsquema.match(/CREATE TABLE/g) || []).length} tablas`);
  console.log(`· seed.sql: ${(sqlDatos.match(/^INSERT INTO/gm) || []).length} INSERT`);
}

/** Quita lo que los hostings compartidos rechazan o no necesitan, y deja intercalaciones que MariaDB entiende. */
function limpiar(sql) {
  return sql
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter(l => !/^\s*\/\*!\d+\s.*\*\/;?\s*$/.test(l)) // /*!40101 SET @saved_cs_client … */; etc.
    .filter(l => !/^\s*SET\s+@/i.test(l)) // SET @@GLOBAL.GTID_PURGED, SET @@SESSION.SQL_LOG_BIN, SET @OLD_…
    .filter(l => !/^\s*(LOCK|UNLOCK) TABLES/i.test(l))
    .join('\n')
    .replace(/\/\*!\d+\s+DEFINER=[^*]*\*\/\s*/g, '')
    .replace(/DEFINER\s*=\s*`[^`]*`@`[^`]*`\s*/g, '')
    .replace(/utf8mb4_0900_ai_ci/g, 'utf8mb4_unicode_ci')
    .replace(/utf8mb4_0900_[a-z_]+/g, 'utf8mb4_unicode_ci')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}
