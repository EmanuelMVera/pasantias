'use strict';

/**
 * NNN-__NOMBRE__.js — DB-XX.
 *
 * <describir el cambio, por qué, y si es expand/migrate/contract>
 */

// DB-01: por defecto la migración corre dentro de una transacción y recibe `t`.
// Poné `false` SOLO si usás `CREATE INDEX CONCURRENTLY` (no puede ir en transacción).
module.exports.useTransaction = true;

module.exports.up = async (queryInterface, Sequelize, t) => {
  // await queryInterface.addColumn('tabla', 'columna', {
  //   type: Sequelize.DataTypes.STRING(50), allowNull: true,
  // }, { transaction: t });
};

module.exports.down = async (queryInterface, Sequelize, t) => {
  // await queryInterface.removeColumn('tabla', 'columna', { transaction: t });
};
