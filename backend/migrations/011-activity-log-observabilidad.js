'use strict';

/**
 * 011-activity-log-observabilidad.js — OPS-01.
 *
 * - activity_logs.requestId (VARCHAR(36) NULL): correlaciona una entrada de
 *   auditoría con los logs técnicos del mismo request (X-Request-Id / req.id).
 *   Nullable, sin backfill — las filas históricas quedan con NULL.
 * - idx_activity_logs_accion_created: el panel de admin (/admin/logs) filtra
 *   por acción; SCALE-02 lo había diferido "sólo si el filtro se vuelve frecuente".
 * - idx_activity_logs_request (parcial): buscar todas las entradas de un request
 *   (forense ante un incidente).
 *
 * `ADD COLUMN` nullable es instantáneo en PG >= 11. Los CREATE INDEX van
 * CONCURRENTLY fuera de transacción (patrón de 002-indices.js / 010).
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('activity_logs', 'requestId', {
      type: Sequelize.DataTypes.STRING(36),
      allowNull: true,
    });

    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_logs_accion_created
      ON "activity_logs" ("accion", "createdAt" DESC);
    `);
    await q(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_logs_request
      ON "activity_logs" ("requestId") WHERE "requestId" IS NOT NULL;
    `);
  },

  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_activity_logs_request;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_activity_logs_accion_created;`);
    await queryInterface.removeColumn('activity_logs', 'requestId');
  },
};
