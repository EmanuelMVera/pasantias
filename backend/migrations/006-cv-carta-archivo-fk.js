'use strict';

/**
 * 006-cv-carta-archivo-fk.js — SEC-01.
 *
 * Agrega perfiles.cvArchivoId / cartaArchivoId (FK nullable a archivos.id).
 * Permite que el frontend deje de usar la ruta cruda (cvPath/cartaRecomendacion)
 * como URL directa y en su lugar pida el archivo por id al endpoint autenticado
 * GET /api/archivos/:id. Las columnas de ruta cruda NO se eliminan (expand
 * pattern, igual que el resto de las migraciones de este proyecto).
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;
    await queryInterface.addColumn('perfiles', 'cvArchivoId', {
      type: DataTypes.UUID, allowNull: true,
      references: { model: 'archivos', key: 'id' },
    });
    await queryInterface.addColumn('perfiles', 'cartaArchivoId', {
      type: DataTypes.UUID, allowNull: true,
      references: { model: 'archivos', key: 'id' },
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('perfiles', 'cartaArchivoId');
    await queryInterface.removeColumn('perfiles', 'cvArchivoId');
  },
};
