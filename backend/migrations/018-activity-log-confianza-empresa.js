'use strict';

/**
 * 018-activity-log-confianza-empresa.js
 *
 * Agrega 4 valores nuevos al ENUM de activity_logs.accion, para la política
 * "empresa estándar vs. empresa de confianza" (RBAC-05):
 *
 * - 'marcar_empresa_confiable' / 'revocar_confianza_empresa' — el admin del
 *   sistema cambia el nivel de confianza institucional de una empresa
 *   (PATCH /api/admin/empresas/:id/confianza).
 * - 'auto_aprobar_solicitud_reclutador' — una empresa de confianza agrega un
 *   reclutador sin aprobación manual (empresaEquipo.service.js::solicitarReclutador).
 * - 'oferta_auto_aprobada' — una empresa de confianza publica una oferta que
 *   nace `estadoModeracion: 'auto_aprobada'` (oferta.controller.js::createOferta).
 *
 * Mismo patrón que 005/014/015: ALTER TYPE ... ADD VALUE es aditivo y no
 * reversible — el down() no elimina valores (Postgres no lo permite sin
 * recrear el tipo completo), solo queda documentado.
 *
 * IMPORTANTE (ver el propio comentario de activityLog.model.js sobre el bug
 * de 'importar_alumnos_csv'): el modelo Sequelize también se actualiza con
 * estos mismos valores en el mismo cambio — si quedan desincronizados,
 * Sequelize rechaza el valor ANTES de llegar a Postgres y la auditoría se
 * pierde en silencio (registrarAuditoria nunca lanza).
 */

module.exports = {
  async up(queryInterface) {
    const valores = [
      'marcar_empresa_confiable',
      'revocar_confianza_empresa',
      'auto_aprobar_solicitud_reclutador',
      'oferta_auto_aprobada',
    ];
    for (const valor of valores) {
      await queryInterface.sequelize.query(
        `ALTER TYPE "enum_activity_logs_accion" ADD VALUE IF NOT EXISTS '${valor}';`
      );
    }
  },

  async down() {
    // No-op deliberado: ver 014-activity-log-importar-csv.js / 015.
  },
};
