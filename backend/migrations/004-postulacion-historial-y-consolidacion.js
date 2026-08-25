'use strict';

/**
 * 004-postulacion-historial-y-consolidacion.js — EST-08 Fase 3.
 *
 * - Crea postulacion_historial_estados y siembra una fila inicial
 *   (NULL → estado actual) por cada postulación existente, para que el
 *   embudo de selección tenga el punto de partida completo.
 * - Consolida los pares legacy/alias que convivían en `postulaciones.estado`
 *   (entrevista_programada→entrevista, no_seleccionado→rechazado) y
 *   endurece el CHECK para que ya no se puedan volver a insertar.
 * - Agrega postulaciones.cvArchivoId (snapshot del CV usado al postularse).
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    await queryInterface.createTable('postulacion_historial_estados', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      postulacionId: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'postulaciones', key: 'id' }, onDelete: 'CASCADE',
      },
      estadoAnterior: { type: DataTypes.STRING(30), allowNull: true },
      estadoNuevo: { type: DataTypes.STRING(30), allowNull: false },
      cambiadoPorUsuarioId: {
        type: DataTypes.INTEGER, allowNull: true,
        references: { model: 'usuarios', key: 'id' }, onDelete: 'SET NULL',
      },
      motivo: { type: DataTypes.TEXT, allowNull: true },
      notaInterna: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('postulacion_historial_estados', ['postulacionId'], { name: 'idx_historial_postulacion' });

    // Consolidar legacy → canónico ANTES de sembrar el historial, para que
    // la fila inicial ya quede con el valor consolidado.
    await queryInterface.sequelize.query(`UPDATE "postulaciones" SET estado = 'entrevista' WHERE estado = 'entrevista_programada';`);
    await queryInterface.sequelize.query(`UPDATE "postulaciones" SET estado = 'rechazado' WHERE estado = 'no_seleccionado';`);

    // Fila inicial de historial por cada postulación existente (alta = NULL → estado actual)
    await queryInterface.sequelize.query(`
      INSERT INTO "postulacion_historial_estados" ("postulacionId", "estadoAnterior", "estadoNuevo", "createdAt")
      SELECT id, NULL, estado, "fechaPostulacion" FROM "postulaciones";
    `);

    // Endurecer el CHECK a solo los 5 valores canónicos
    await queryInterface.removeConstraint('postulaciones', 'chk_postulaciones_estado');
    await queryInterface.sequelize.query(`
      ALTER TABLE "postulaciones" ADD CONSTRAINT chk_postulaciones_estado
      CHECK (estado IN ('en_revision','preseleccionado','entrevista','contratado','rechazado'));
    `);

    // Snapshot del CV usado al momento de postularse
    await queryInterface.addColumn('postulaciones', 'cvArchivoId', {
      type: DataTypes.UUID, allowNull: true,
      references: { model: 'archivos', key: 'id' },
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('postulaciones', 'cvArchivoId');
    await queryInterface.removeConstraint('postulaciones', 'chk_postulaciones_estado');
    await queryInterface.sequelize.query(`
      ALTER TABLE "postulaciones" ADD CONSTRAINT chk_postulaciones_estado
      CHECK (estado IN ('en_revision','preseleccionado','entrevista_programada','entrevista','no_seleccionado','rechazado','contratado'));
    `);
    // Nota: no se revierte la consolidación de datos (entrevista_programada/no_seleccionado
    // vueltos a separar) — el down() de una migración de datos no intenta adivinar
    // cuáles filas eran cuáles antes del UPDATE, solo revierte el esquema.
    await queryInterface.dropTable('postulacion_historial_estados');
  },
};
