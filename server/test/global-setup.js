// Reconstruye la base de pruebas: borra todo, migra y carga los datos iniciales.
export async function setup({ config }) {
  Object.assign(process.env, config.env);
  const { db } = await import('../db.js');
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  await db.seed.run();
  await db.destroy();
}
