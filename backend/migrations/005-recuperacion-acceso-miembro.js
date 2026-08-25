'use strict';

/**
 * 005-recuperacion-acceso-miembro.js — EST-10.
 *
 * Agrega 'solicitar_recuperacion_miembro' al ENUM de activity_logs.accion,
 * para poder auditar con precisión cuándo un admin_empresa dispara un email
 * de recuperación de acceso para un reclutador (sin registrar password ni
 * token — eso vive en el `detalle` JSON del log, nunca en el ENUM).
 *
 * ALTER TYPE ... ADD VALUE es aditivo y no reversible (mismo caso ya
 * documentado para los ENUM legacy de la baseline) — el down() no elimina
 * el valor, solo lo deja en desuso, consistente con cómo se trató el resto
 * de los ENUM de este proyecto.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_activity_logs_accion" ADD VALUE IF NOT EXISTS 'solicitar_recuperacion_miembro';`
    );
  },

  async down() {
    // No-op deliberado: Postgres no permite quitar un valor de un ENUM sin
    // recrear el tipo completo. Si algún día se migra activity_logs.accion
    // a VARCHAR + CHECK (ya recomendado en EST-08 Fase 9), este valor se
    // limpia ahí junto con el resto.
  },
};
