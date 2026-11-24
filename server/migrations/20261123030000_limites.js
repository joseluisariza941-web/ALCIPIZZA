// Ventanas de límite de intentos (las usa la API en PHP; en Hostinger no hay memoria compartida entre peticiones).
export async function up(knex) {
  await knex.schema.createTable('limites', t => {
    t.string('clave', 190).primary();
    t.integer('conteo').unsigned().notNullable().defaultTo(0);
    t.bigInteger('reinicia_en').unsigned().notNullable();
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('limites');
}
