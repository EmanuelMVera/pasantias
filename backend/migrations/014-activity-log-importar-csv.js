'use strict';

/**
 * 014-activity-log-importar-csv.js
 *
 * Agrega 'importar_alumnos_csv' al ENUM de activity_logs.accion, para poder
 * auditar la importación masiva de alumnos/egresados por CSV (quién la
 * corrió, cuántas filas, cuántos usuarios se crearon — el detalle vive en el
 * `detalle` JSON del log, nunca en el ENUM). Mismo patrón que
 * 005-recuperacion-acceso-miembro.js.
 *
 * ALTER TYPE ... ADD VALUE es aditivo y no reversible — el down() no elimina
 * el valor, solo lo deja en desuso, consistente con el resto de los ENUM de
 * este proyecto.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_activity_logs_accion" ADD VALUE IF NOT EXISTS 'importar_alumnos_csv';`
    );
  },

  async down() {
    // No-op deliberado: Postgres no permite quitar un valor de un ENUM sin
    // recrear el tipo completo (ver 005-recuperacion-acceso-miembro.js).
  },
};
