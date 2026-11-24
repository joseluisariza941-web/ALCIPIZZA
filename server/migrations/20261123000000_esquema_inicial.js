// Esquema normalizado de Alcipizza para MySQL 8.
// Reemplaza las tablas con columna JSON "Datos" de la versión SQL Server.

const timestamps = (t, knex) => {
  t.timestamp('creado_en').notNullable().defaultTo(knex.fn.now());
  t.timestamp('actualizado_en').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'));
};

/** @param {import('knex').Knex} knex */
export async function up(knex) {
  await knex.schema.createTable('usuarios', t => {
    t.increments('id');
    t.string('usuario', 50).notNullable().unique();
    t.string('nombre', 80).notNullable();
    t.enu('rol', ['dev', 'cocina', 'mesera']).notNullable();
    t.string('clave_hash', 255).notNullable();
    t.boolean('activo').notNullable().defaultTo(true);
    t.boolean('debe_cambiar_clave').notNullable().defaultTo(true);
    t.tinyint('intentos_fallidos').unsigned().notNullable().defaultTo(0);
    t.timestamp('bloqueado_hasta').nullable();
    t.timestamp('ultimo_ingreso').nullable();
    timestamps(t, knex);
  });

  // Sesiones de express-session (formato de express-mysql-session).
  await knex.schema.createTable('sessions', t => {
    t.string('session_id', 128).primary();
    t.integer('expires').unsigned().notNullable().index();
    t.text('data', 'mediumtext');
  });

  await knex.schema.createTable('surtidores', t => {
    t.increments('id');
    t.string('nombre', 120).notNullable();
    t.string('empresa', 120);
    t.string('correo', 120);
    t.string('telefono', 40);
    timestamps(t, knex);
  });

  await knex.schema.createTable('insumos', t => {
    t.increments('id');
    t.string('nombre', 120).notNullable().unique();
    t.enu('tipo', ['insumo', 'salsa']).notNullable().defaultTo('insumo');
    t.string('unidad', 10).notNullable();
    t.decimal('stock', 14, 3).notNullable().defaultTo(0);
    t.decimal('stock_referencia', 14, 3).notNullable().defaultTo(0);
    t.decimal('costo', 12, 2).notNullable().defaultTo(0);
    t.integer('surtidor_id').unsigned().references('surtidores.id').onDelete('SET NULL'); // NULL = compra en tienda
    timestamps(t, knex);
  });

  await knex.schema.createTable('categorias', t => {
    t.increments('id');
    t.string('nombre', 60).notNullable().unique();
    t.smallint('orden').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('platos', t => {
    t.increments('id');
    t.integer('categoria_id').unsigned().notNullable().references('categorias.id').onDelete('RESTRICT');
    t.string('nombre', 120).notNullable();
    t.string('emoji', 16);
    t.string('imagen_url', 500);
    t.boolean('activo').notNullable().defaultTo(true);
    t.smallint('orden').notNullable().defaultTo(0);
    timestamps(t, knex);
  });

  await knex.schema.createTable('plato_variantes', t => {
    t.increments('id');
    t.integer('plato_id').unsigned().notNullable().references('platos.id').onDelete('CASCADE');
    t.string('nombre', 60).notNullable();
    t.decimal('precio', 12, 2).notNullable();
    t.decimal('multiplicador', 6, 3).notNullable().defaultTo(1); // escala los ingredientes
    t.smallint('orden').notNullable().defaultTo(0);
    t.unique(['plato_id', 'nombre']);
  });

  await knex.schema.createTable('plato_ingredientes', t => {
    t.integer('plato_id').unsigned().notNullable().references('platos.id').onDelete('CASCADE');
    t.integer('insumo_id').unsigned().notNullable().references('insumos.id').onDelete('RESTRICT');
    t.decimal('cantidad', 12, 3).notNullable();
    t.string('unidad', 10); // NULL = misma unidad del insumo (unidades)
    t.primary(['plato_id', 'insumo_id']);
  });

  await knex.schema.createTable('plato_salsas', t => {
    t.integer('plato_id').unsigned().notNullable().references('platos.id').onDelete('CASCADE');
    t.integer('insumo_id').unsigned().notNullable().references('insumos.id').onDelete('CASCADE');
    t.primary(['plato_id', 'insumo_id']);
  });

  await knex.schema.createTable('extras', t => {
    t.increments('id');
    t.string('nombre', 120).notNullable();
    t.integer('insumo_id').unsigned().references('insumos.id').onDelete('SET NULL');
    t.decimal('cantidad', 12, 3).notNullable().defaultTo(0);
    t.string('unidad', 10);
    t.decimal('precio', 12, 2).notNullable();
    t.string('grupo', 40); // extras del mismo grupo son excluyentes (p. ej. tamaños de papas)
    timestamps(t, knex);
  });

  await knex.schema.createTable('plato_extras', t => {
    t.integer('plato_id').unsigned().notNullable().references('platos.id').onDelete('CASCADE');
    t.integer('extra_id').unsigned().notNullable().references('extras.id').onDelete('CASCADE');
    t.primary(['plato_id', 'extra_id']);
  });

  await knex.schema.createTable('metodos_pago', t => {
    t.string('codigo', 10).primary();
    t.string('nombre', 60).notNullable();
    t.string('numero', 60);
    t.boolean('activo').notNullable().defaultTo(true);
    t.smallint('orden').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('pedidos', t => {
    t.increments('id');
    t.enu('origen', ['web', 'mesera']).notNullable();
    t.integer('mesera_id').unsigned().references('usuarios.id').onDelete('SET NULL');
    t.string('destino', 100).notNullable(); // En el local · Mesa N / Domicilio / Recoger en local / Mesa N
    t.string('cliente', 100);
    t.string('direccion', 200);
    t.string('telefono', 30);
    t.decimal('total', 12, 2).notNullable();
    t.enu('estado', ['nuevo', 'preparando', 'listo', 'entregado', 'cancelado']).notNullable().defaultTo('nuevo');
    t.enu('pago_estado', ['pendiente', 'pagado']).notNullable().defaultTo('pendiente');
    t.string('metodo_pago', 10).references('metodos_pago.codigo').onDelete('SET NULL');
    t.timestamp('pagado_en').nullable();
    t.integer('cobrado_por').unsigned().references('usuarios.id').onDelete('SET NULL');
    t.specificType('token_hash', 'CHAR(64)').unique(); // SHA-256 del código privado de la tirilla del cliente
    timestamps(t, knex);
    t.index(['creado_en']);
    t.index(['estado', 'creado_en']);
  });

  await knex.schema.createTable('pedido_items', t => {
    t.increments('id');
    t.integer('pedido_id').unsigned().notNullable().references('pedidos.id').onDelete('CASCADE');
    t.integer('plato_id').unsigned().references('platos.id').onDelete('SET NULL');
    t.string('nombre', 120).notNullable(); // copia al momento del pedido
    t.string('emoji', 16);
    t.string('variante', 60).notNullable();
    t.decimal('precio_unitario', 12, 2).notNullable(); // variante + extras, calculado en el servidor
    t.string('nota', 300);
  });

  await knex.schema.createTable('pedido_item_extras', t => {
    t.increments('id');
    t.integer('item_id').unsigned().notNullable().references('pedido_items.id').onDelete('CASCADE');
    t.integer('extra_id').unsigned().references('extras.id').onDelete('SET NULL');
    t.string('nombre', 120).notNullable();
    t.decimal('precio', 12, 2).notNullable();
  });

  await knex.schema.createTable('pedido_item_salsas', t => {
    t.integer('item_id').unsigned().notNullable().references('pedido_items.id').onDelete('CASCADE');
    t.string('salsa', 120).notNullable();
    t.primary(['item_id', 'salsa']);
  });

  await knex.schema.createTable('pedido_item_sin', t => { // ingredientes que el cliente quitó
    t.integer('item_id').unsigned().notNullable().references('pedido_items.id').onDelete('CASCADE');
    t.string('ingrediente', 120).notNullable();
    t.primary(['item_id', 'ingrediente']);
  });

  await knex.schema.createTable('compras', t => {
    t.increments('id');
    t.timestamp('fecha').notNullable().defaultTo(knex.fn.now()).index();
    t.integer('insumo_id').unsigned().notNullable().references('insumos.id').onDelete('RESTRICT');
    t.decimal('cantidad', 14, 3).notNullable();
    t.string('unidad', 10).notNullable();
    t.decimal('costo', 12, 2).notNullable().defaultTo(0);
    t.integer('surtidor_id').unsigned().references('surtidores.id').onDelete('SET NULL');
    t.integer('registrado_por').unsigned().references('usuarios.id').onDelete('SET NULL');
  });

  await knex.schema.createTable('bitacora', t => {
    t.bigIncrements('id');
    t.timestamp('fecha').notNullable().defaultTo(knex.fn.now()).index();
    t.integer('usuario_id').unsigned().references('usuarios.id').onDelete('SET NULL');
    t.string('usuario', 50).notNullable(); // copia: "cliente" para pedidos web
    t.string('nombre', 80);
    t.string('accion', 400).notNullable();
    t.string('ip', 45);
  });

  await knex.schema.createTable('config', t => {
    t.string('clave', 40).primary();
    t.json('valor').notNullable();
    t.timestamp('actualizado_en').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'));
  });

  await knex.schema.createTable('suscripcion', t => {
    t.tinyint('id').unsigned().primary(); // siempre 1
    t.boolean('activa').notNullable().defaultTo(true);
    t.date('hasta').notNullable();
    t.timestamp('actualizado_en').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'));
  });
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  for (const t of ['suscripcion', 'config', 'bitacora', 'compras', 'pedido_item_sin', 'pedido_item_salsas',
    'pedido_item_extras', 'pedido_items', 'pedidos', 'metodos_pago', 'plato_extras', 'extras', 'plato_salsas',
    'plato_ingredientes', 'plato_variantes', 'platos', 'categorias', 'insumos', 'surtidores', 'sessions', 'usuarios']) {
    await knex.schema.dropTableIfExists(t);
  }
}
