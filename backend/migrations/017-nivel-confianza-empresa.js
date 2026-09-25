'use strict';

/**
 * 017-nivel-confianza-empresa.js — RBAC-05.
 *
 * Política institucional "empresa estándar vs. empresa de confianza": evita
 * que el admin del sistema sea un cuello de botella para empresas con
 * relación institucional ya establecida. Agrega `empresas.nivelConfianza`
 * — STRING + CHECK (no ENUM de Postgres), mismo criterio ya adoptado para
 * Oferta.estado/estadoModeracion (migración 016) — nunca `estadoAprobacion`,
 * que sigue siendo el ENUM histórico sin tocar.
 *
 * Default 'estandar': toda empresa existente y toda empresa nueva arranca
 * sin confianza — otorgarla es una decisión explícita del admin del sistema
 * (PATCH /api/admin/empresas/:id/confianza).
 *
 * No hace falta CREATE INDEX CONCURRENTLY acá: es un campo de baja
 * cardinalidad en una tabla chica (empresas), sin ninguna query caliente
 * que lo requiera todavía.
 */

module.exports.useTransaction = true;

module.exports.up = async (queryInterface, Sequelize, t) => {
  await queryInterface.addColumn('empresas', 'nivelConfianza', {
    type: Sequelize.DataTypes.STRING(20),
    defaultValue: 'estandar',
  }, { transaction: t });

  await queryInterface.sequelize.query(
    `ALTER TABLE "empresas" ADD CONSTRAINT chk_empresas_nivel_confianza
     CHECK ("nivelConfianza" IN ('estandar', 'confiable'))`,
    { transaction: t },
  );
};

module.exports.down = async (queryInterface, Sequelize, t) => {
  await queryInterface.sequelize.query(
    `ALTER TABLE "empresas" DROP CONSTRAINT chk_empresas_nivel_confianza`,
    { transaction: t },
  );
  await queryInterface.removeColumn('empresas', 'nivelConfianza', { transaction: t });
};
