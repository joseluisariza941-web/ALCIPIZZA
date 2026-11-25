// Fase 3: insumos desactivables, QR por método de pago, puntos de fidelidad, promociones y descuentos en pedidos.

/** @param {import('knex').Knex} knex */
export async function up(knex) {
  await knex.schema.alterTable('insumos', t => {
    t.boolean('activo').notNullable().defaultTo(true); // 0 = desactivado (tiene compras): oculto en listas y selectores
  });

  await knex.schema.alterTable('metodos_pago', t => {
    t.text('qr_url', 'mediumtext').nullable(); // imagen del QR (data URL comprimida o URL https)
  });

  await knex.schema.alterTable('pedidos', t => {
    t.string('celular', 15).nullable().index(); // identifica al cliente en los puntos
    t.decimal('subtotal', 12, 2).nullable(); // suma de los ítems antes de descuentos (NULL en pedidos viejos = total)
    t.decimal('descuento_promo', 12, 2).notNullable().defaultTo(0);
    t.integer('promocion_id').unsigned().nullable();
    t.string('promocion_nombre', 80).nullable(); // copia al momento del pedido
    t.integer('puntos_canjeados').unsigned().notNullable().defaultTo(0);
    t.decimal('descuento_puntos', 12, 2).notNullable().defaultTo(0);
    t.integer('puntos_ganados').unsigned().notNullable().defaultTo(0);
    t.timestamp('editado_en').nullable();
    t.boolean('cancelado_por_cliente').notNullable().defaultTo(false);
  });

  await knex.schema.createTable('promociones', t => {
    t.increments('id');
    t.string('nombre', 80).notNullable();
    t.enu('tipo', ['porcentaje', 'monto']).notNullable();
    t.enu('alcance', ['plato', 'categoria', 'total']).notNullable();
    t.integer('plato_id').unsigned().nullable().references('platos.id').onDelete('CASCADE');
    t.integer('categoria_id').unsigned().nullable().references('categorias.id').onDelete('CASCADE');
    t.decimal('valor', 12, 2).notNullable(); // % (1..100) o pesos
    t.decimal('monto_minimo', 12, 2).nullable(); // solo alcance "total"
    t.date('inicio').notNullable();
    t.date('fin').notNullable();
    t.string('dias', 20).nullable(); // "0,1,4" (lunes=0..domingo=6); NULL = todos
    t.string('hora_desde', 5).nullable(); // "HH:MM"
    t.string('hora_hasta', 5).nullable();
    t.boolean('activa').notNullable().defaultTo(true);
    t.timestamp('creado_en').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('puntos_clientes', t => {
    t.string('celular', 15).primary();
    t.string('nombre', 100).nullable();
    t.integer('saldo').notNullable().defaultTo(0);
    t.timestamp('actualizado_en').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'));
  });

  await knex.schema.createTable('puntos_movimientos', t => {
    t.increments('id');
    t.string('celular', 15).notNullable().index();
    t.integer('pedido_id').unsigned().nullable().references('pedidos.id').onDelete('SET NULL');
    t.enu('tipo', ['ganado', 'canjeado', 'devuelto', 'revertido']).notNullable();
    t.integer('puntos').notNullable(); // con signo
    t.timestamp('creado_en').notNullable().defaultTo(knex.fn.now());
  });
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('puntos_movimientos');
  await knex.schema.dropTableIfExists('puntos_clientes');
  await knex.schema.dropTableIfExists('promociones');
  await knex.schema.alterTable('pedidos', t => {
    for (const c of ['cancelado_por_cliente', 'editado_en', 'puntos_ganados', 'descuento_puntos', 'puntos_canjeados',
      'promocion_nombre', 'promocion_id', 'descuento_promo', 'subtotal']) t.dropColumn(c);
    t.dropIndex(['celular']);
    t.dropColumn('celular');
  });
  await knex.schema.alterTable('metodos_pago', t => t.dropColumn('qr_url'));
  await knex.schema.alterTable('insumos', t => t.dropColumn('activo'));
}
