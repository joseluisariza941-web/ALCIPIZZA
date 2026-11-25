// Archivado de reportes y eliminación lógica: nada de lo registrado se borra.

/** @param {import('knex').Knex} knex */
export async function up(knex) {
  await knex.schema.alterTable('pedidos', t => {
    t.timestamp('archivado_en').nullable().index();
  });
  await knex.schema.alterTable('compras', t => {
    t.timestamp('archivado_en').nullable().index();
    t.timestamp('eliminado_en').nullable().index();
  });
  await knex.schema.alterTable('bitacora', t => {
    t.timestamp('archivado_en').nullable().index();
  });

  await knex.schema.alterTable('insumos', t => {
    t.timestamp('eliminado_en').nullable().index();
  });
  await knex('insumos').where('activo', false).update({ eliminado_en: knex.fn.now() });
  await knex.schema.alterTable('insumos', t => t.dropColumn('activo'));

  for (const tabla of ['platos', 'extras', 'surtidores', 'promociones', 'usuarios', 'metodos_pago']) {
    await knex.schema.alterTable(tabla, t => {
      t.timestamp('eliminado_en').nullable().index();
    });
  }
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  for (const tabla of ['metodos_pago', 'usuarios', 'promociones', 'surtidores', 'extras', 'platos']) {
    await knex.schema.alterTable(tabla, t => {
      t.dropIndex(['eliminado_en']);
      t.dropColumn('eliminado_en');
    });
  }

  await knex.schema.alterTable('insumos', t => {
    t.boolean('activo').notNullable().defaultTo(true);
  });
  await knex('insumos').whereNotNull('eliminado_en').update({ activo: false });
  await knex.schema.alterTable('insumos', t => {
    t.dropIndex(['eliminado_en']);
    t.dropColumn('eliminado_en');
  });

  await knex.schema.alterTable('bitacora', t => {
    t.dropIndex(['archivado_en']);
    t.dropColumn('archivado_en');
  });
  await knex.schema.alterTable('compras', t => {
    t.dropIndex(['archivado_en']);
    t.dropIndex(['eliminado_en']);
    t.dropColumn('archivado_en');
    t.dropColumn('eliminado_en');
  });
  await knex.schema.alterTable('pedidos', t => {
    t.dropIndex(['archivado_en']);
    t.dropColumn('archivado_en');
  });
}
