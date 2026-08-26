'use strict';

/**
 * 007-solicitud-empresa-auditoria.js — TEST-01.
 *
 * `solicitudEmpresa.model.js` ya declara (desde EST-08 §4.7) las columnas de
 * auditoría de revisión (`revisadaPorUsuarioId`, `revisadaEn`, `motivoRechazo`,
 * `empresaIdCreada`), pero ninguna migración las había agregado a la tabla —
 * drift entre modelo y esquema real. Quedó sin detectar porque la base de
 * desarrollo se creó originalmente con `sequelize.sync({alter:true})` (que sí
 * las agregó ahí) antes de que las migraciones fueran la fuente de verdad;
 * una base creada solo desde migraciones (como la de test) no las tenía.
 * Detectado por la suite de tests (TEST-01) al fallar el insert de una
 * SolicitudEmpresa contra una base migrada desde cero.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;
    await queryInterface.addColumn('solicitudes_empresa', 'revisadaPorUsuarioId', {
      type: DataTypes.INTEGER, allowNull: true,
      references: { model: 'usuarios', key: 'id' }, onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('solicitudes_empresa', 'revisadaEn', {
      type: DataTypes.DATE, allowNull: true,
    });
    await queryInterface.addColumn('solicitudes_empresa', 'motivoRechazo', {
      type: DataTypes.TEXT, allowNull: true,
    });
    await queryInterface.addColumn('solicitudes_empresa', 'empresaIdCreada', {
      type: DataTypes.INTEGER, allowNull: true,
      references: { model: 'empresas', key: 'id' }, onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('solicitudes_empresa', 'empresaIdCreada');
    await queryInterface.removeColumn('solicitudes_empresa', 'motivoRechazo');
    await queryInterface.removeColumn('solicitudes_empresa', 'revisadaEn');
    await queryInterface.removeColumn('solicitudes_empresa', 'revisadaPorUsuarioId');
  },
};
