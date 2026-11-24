// Guarda el id de la variante en cada ítem del pedido (para editar sin buscar por nombre).

/** @param {import('knex').Knex} knex */
export async function up(knex) {
  await knex.schema.alterTable('pedido_items', t => {
    t.integer('variante_id').unsigned().nullable().after('plato_id')
      .references('id').inTable('plato_variantes').onDelete('SET NULL');
  });
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  await knex.schema.alterTable('pedido_items', t => {
    t.dropForeign(['variante_id']);
    t.dropColumn('variante_id');
  });
}
