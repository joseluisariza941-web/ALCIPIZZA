// Marca si el inventario de un pedido ya se descontó (se descuenta una sola vez).

/** @param {import('knex').Knex} knex */
export async function up(knex) {
  await knex.schema.alterTable('pedidos', t => {
    t.boolean('inventario_descontado').notNullable().defaultTo(false).after('estado');
  });
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  await knex.schema.alterTable('pedidos', t => t.dropColumn('inventario_descontado'));
}
