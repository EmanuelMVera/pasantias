'use strict';

/**
 * 003-archivos.js — EST-08 Fase 4.
 *
 * Tabla de metadata de archivos subidos (CV, cartas, fotos, logos).
 * Los campos STRING existentes (cvPath, cartaRecomendacion, fotoPerfil,
 * logo) se conservan intactos — esta tabla se puebla en paralelo a partir
 * de ahora (expand pattern), sin romper ninguna lectura actual del
 * frontend.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    await queryInterface.sequelize.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`); // para gen_random_uuid()

    await queryInterface.createTable('archivos', {
      id: {
        type: DataTypes.UUID, primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      usuarioPropietarioId: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'usuarios', key: 'id' }, onDelete: 'CASCADE',
      },
      tipo: { type: DataTypes.STRING(30), allowNull: false },
      nombreOriginal: { type: DataTypes.STRING(255), allowNull: true },
      claveAlmacenamiento: { type: DataTypes.STRING(500), allowNull: false },
      mimeType: { type: DataTypes.STRING(100), allowNull: true },
      tamanioBytes: { type: DataTypes.INTEGER, allowNull: true },
      hashSha256: { type: DataTypes.STRING(64), allowNull: true },
      backend: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'local' },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      deletedAt: { type: DataTypes.DATE, allowNull: true },
    });

    await queryInterface.sequelize.query(
      `ALTER TABLE "archivos" ADD CONSTRAINT chk_archivos_tipo CHECK (tipo IN ('cv','carta_recomendacion','foto_perfil','logo_empresa','certificacion','adjunto_mensaje'));`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE "archivos" ADD CONSTRAINT chk_archivos_backend CHECK (backend IN ('local','s3'));`
    );
    await queryInterface.addIndex('archivos', ['usuarioPropietarioId'], { name: 'idx_archivos_propietario' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('archivos');
  },
};
