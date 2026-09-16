'use strict';

/**
 * 013-ofertas-creador-auditoria.js
 *
 * Agrega `ofertas.creadaPorUsuarioId` (INTEGER, FK nullable a usuarios.id,
 * ON DELETE SET NULL) — mismo patrón que `empresas.aprobadaPorUsuarioId`
 * (001 + 008). Es SOLO un campo de auditoría/atribución: no cambia ninguna
 * regla de autorización ni de visibilidad (empresa.middleware.js y
 * empresa.service.js no se tocan) — admin_empresa y reclutador siguen viendo
 * TODAS las ofertas de su empresa sin filtrar por creador.
 *
 * Ofertas históricas quedan con creadaPorUsuarioId = NULL (no hay una fuente
 * confiable para inferirlo retroactivamente).
 *
 * ADD COLUMN nullable sin default: operación de solo metadata en Postgres
 * (no reescribe la tabla). El índice va CONCURRENTLY (no bloquea escrituras
 * sobre "ofertas" en producción) — mismo criterio que 010-indices-escala.js.
 * Por eso esta migración NO declara `useTransaction` (CONCURRENTLY no puede
 * correr dentro de una transacción).
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    await queryInterface.addColumn('ofertas', 'creadaPorUsuarioId', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'usuarios', key: 'id' },
      onDelete: 'SET NULL',
    });

    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ofertas_creada_por
      ON "ofertas" ("creadaPorUsuarioId")
      WHERE "creadaPorUsuarioId" IS NOT NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS idx_ofertas_creada_por;
    `);
    await queryInterface.removeColumn('ofertas', 'creadaPorUsuarioId');
  },
};
