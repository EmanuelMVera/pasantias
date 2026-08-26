'use strict';

/**
 * 009-archivos-fk-set-null.js — BUG-01.
 *
 * `postulaciones.cvArchivoId` (004), `perfiles.cvArchivoId` y
 * `perfiles.cartaArchivoId` (006) se crearon sin regla `onDelete` — mismo
 * defecto ya corregido para `empresas.aprobadaPorUsuarioId` en 008. Son
 * referencias de snapshot/histórico a `archivos`; no deben bloquear el
 * borrado real de un Archivo (Postgres las trata como NO ACTION por
 * defecto). Se cambian a SET NULL, mismo criterio que 007/008.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.removeConstraint('postulaciones', 'postulaciones_cvArchivoId_fkey');
    await queryInterface.addConstraint('postulaciones', {
      fields: ['cvArchivoId'],
      type: 'foreign key',
      name: 'postulaciones_cvArchivoId_fkey',
      references: { table: 'archivos', field: 'id' },
      onDelete: 'SET NULL',
    });

    await queryInterface.removeConstraint('perfiles', 'perfiles_cvArchivoId_fkey');
    await queryInterface.addConstraint('perfiles', {
      fields: ['cvArchivoId'],
      type: 'foreign key',
      name: 'perfiles_cvArchivoId_fkey',
      references: { table: 'archivos', field: 'id' },
      onDelete: 'SET NULL',
    });

    await queryInterface.removeConstraint('perfiles', 'perfiles_cartaArchivoId_fkey');
    await queryInterface.addConstraint('perfiles', {
      fields: ['cartaArchivoId'],
      type: 'foreign key',
      name: 'perfiles_cartaArchivoId_fkey',
      references: { table: 'archivos', field: 'id' },
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('postulaciones', 'postulaciones_cvArchivoId_fkey');
    await queryInterface.addConstraint('postulaciones', {
      fields: ['cvArchivoId'],
      type: 'foreign key',
      name: 'postulaciones_cvArchivoId_fkey',
      references: { table: 'archivos', field: 'id' },
    });

    await queryInterface.removeConstraint('perfiles', 'perfiles_cvArchivoId_fkey');
    await queryInterface.addConstraint('perfiles', {
      fields: ['cvArchivoId'],
      type: 'foreign key',
      name: 'perfiles_cvArchivoId_fkey',
      references: { table: 'archivos', field: 'id' },
    });

    await queryInterface.removeConstraint('perfiles', 'perfiles_cartaArchivoId_fkey');
    await queryInterface.addConstraint('perfiles', {
      fields: ['cartaArchivoId'],
      type: 'foreign key',
      name: 'perfiles_cartaArchivoId_fkey',
      references: { table: 'archivos', field: 'id' },
    });
  },
};
