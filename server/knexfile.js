import 'dotenv/config';

/** @type {import('knex').Knex.Config} */
export default {
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3310),
    database: process.env.DB_NAME || 'alcipizza',
    user: process.env.DB_USER || 'alcipizza',
    password: process.env.DB_PASSWORD || '',
    charset: 'utf8mb4',
    timezone: '-05:00',
    decimalNumbers: true,
  },
  pool: { min: 0, max: 10 },
  migrations: { directory: './migrations', tableName: 'knex_migraciones', loadExtensions: ['.js'] },
  seeds: { directory: './seeds', loadExtensions: ['.js'] },
};
