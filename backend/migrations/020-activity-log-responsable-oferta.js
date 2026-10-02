'use strict';

/**
 * 020-activity-log-responsable-oferta.js
 *
 * Agrega 2 valores al ENUM de activity_logs.accion, para auditar cuando un
 * admin_empresa asigna o cambia el reclutador responsable de una oferta
 * (PATCH /api/empresas/ofertas/:id/responsable):
 *
 * - 'asignar_responsable_oferta'   — la oferta no tenía responsable.
 * - 'reasignar_responsable_oferta' — la oferta pasa de un responsable a otro.
 *
 * Solo toca el ENUM de auditoría: NO modifica ofertas ni hace backfill. Las
 * ofertas históricas siguen con `creadaPorUsuarioId = NULL` hasta que un
 * admin_empresa las gestione a mano.
 *
 * Mismo patrón que 005/014/015/018: ALTER TYPE ... ADD VALUE es aditivo y no
 * reversible. El modelo Sequelize (activityLog.model.js) se actualiza en el
 * mismo cambio: si quedan desincronizados, Sequelize rechaza el valor antes de
 * llegar a Postgres y la auditoría se pierde en silencio.
 */

module.exports = {
  async up(queryInterface) {
    const valores = ['asignar_responsable_oferta', 'reasignar_responsable_oferta'];
    for (const valor of valores) {
      await queryInterface.sequelize.query(
        `ALTER TYPE "enum_activity_logs_accion" ADD VALUE IF NOT EXISTS '${valor}';`
      );
    }
  },

  async down() {
    // No-op deliberado: ver 014-activity-log-importar-csv.js / 015 / 018.
  },
};
