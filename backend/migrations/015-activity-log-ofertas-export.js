'use strict';

/**
 * 015-activity-log-ofertas-export.js
 *
 * Agrega 4 valores nuevos al ENUM de activity_logs.accion:
 *
 * - 'pausar_oferta' / 'reactivar_oferta' — RBAC-01: admin_empresa/reclutador ahora
 *   cambian el estado de una oferta por PATCH /api/ofertas/:id/estado (antes solo
 *   existía 'cerrar_oferta', que ya estaba en el ENUM desde la baseline).
 * - 'exportar_logs' / 'exportar_estadisticas' — auditoría de las exportaciones
 *   PDF/Excel del panel de administración (sección 14 del pedido de iteración
 *   funcional/visual).
 *
 * Mismo patrón que 005/014: ALTER TYPE ... ADD VALUE es aditivo y no reversible
 * — el down() no elimina valores (Postgres no lo permite sin recrear el tipo
 * completo), solo los deja documentados como en desuso si se revierte la feature.
 */

module.exports = {
  async up(queryInterface) {
    const valores = ['pausar_oferta', 'reactivar_oferta', 'exportar_logs', 'exportar_estadisticas'];
    for (const valor of valores) {
      await queryInterface.sequelize.query(
        `ALTER TYPE "enum_activity_logs_accion" ADD VALUE IF NOT EXISTS '${valor}';`
      );
    }
  },

  async down() {
    // No-op deliberado: ver 014-activity-log-importar-csv.js.
  },
};
