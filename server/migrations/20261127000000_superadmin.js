// Rol "superadmin": suma de dev y cocina. Compatible con MySQL 8.4 y MariaDB 11.8.

/** @param {import('knex').Knex} knex */
export async function up(knex) {
  await knex.raw("ALTER TABLE `usuarios` MODIFY `rol` ENUM('dev','cocina','mesera','superadmin') NOT NULL");
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  // Los superadmin pasan a dev para poder volver al enum anterior sin perder las cuentas.
  await knex('usuarios').where({ rol: 'superadmin' }).update({ rol: 'dev' });
  await knex.raw("ALTER TABLE `usuarios` MODIFY `rol` ENUM('dev','cocina','mesera') NOT NULL");
}
