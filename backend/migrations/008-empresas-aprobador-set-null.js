'use strict';

/**
 * 008-empresas-aprobador-set-null.js — TEST-01.
 *
 * `empresas.aprobadaPorUsuarioId` (agregada en 001-fase1-seguridad-identidad)
 * quedó sin regla ON DELETE — Postgres la trata como NO ACTION por defecto,
 * así que un admin que aprobó alguna empresa nunca puede borrarse (ni con
 * `force:true`, que es exactamente cómo lo detectó la suite de tests al
 * limpiar sus propios datos). Es una referencia de auditoría histórica, no
 * debe bloquear el borrado de la cuenta: se cambia a SET NULL, mismo criterio
 * ya usado en 007 para `solicitudes_empresa.revisadaPorUsuarioId`.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.removeConstraint('empresas', 'empresas_aprobadaPorUsuarioId_fkey');
    await queryInterface.addConstraint('empresas', {
      fields: ['aprobadaPorUsuarioId'],
      type: 'foreign key',
      name: 'empresas_aprobadaPorUsuarioId_fkey',
      references: { table: 'usuarios', field: 'id' },
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('empresas', 'empresas_aprobadaPorUsuarioId_fkey');
    await queryInterface.addConstraint('empresas', {
      fields: ['aprobadaPorUsuarioId'],
      type: 'foreign key',
      name: 'empresas_aprobadaPorUsuarioId_fkey',
      references: { table: 'usuarios', field: 'id' },
    });
  },
};
