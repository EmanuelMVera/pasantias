'use strict';

/**
 * 001-fase1-seguridad-identidad.js — EST-08 Fase 1.
 *
 * - usuarios: tokenResetUsadoEn, tokenVersion, deletedAt (soft delete),
 *   UNIQUE case-insensitive sobre email.
 * - perfiles: legajo (UNIQUE), UNIQUE(usuarioId).
 * - empresas: cuit ahora VARCHAR(11) UNIQUE + CHECK de formato,
 *   UNIQUE(usuarioId), columnas de auditoría de aprobación, deletedAt.
 * - ofertas: deletedAt (soft delete).
 * - configuracion_institucional: tabla nueva + seed de 'legajo.regex'.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    // ── usuarios ─────────────────────────────────────────────────────────
    await queryInterface.addColumn('usuarios', 'tokenResetUsadoEn', { type: DataTypes.DATE, allowNull: true });
    await queryInterface.addColumn('usuarios', 'tokenVersion', { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
    await queryInterface.addColumn('usuarios', 'deletedAt', { type: DataTypes.DATE, allowNull: true });

    // Normaliza emails existentes a minúsculas antes de crear el índice
    // case-insensitive, para no dejar duplicados ocultos por diferencia
    // de mayúsculas (ej. "Juan@x.com" vs "juan@x.com").
    await queryInterface.sequelize.query(`UPDATE "usuarios" SET email = LOWER(email);`);
    // El UNIQUE original (sobre email tal cual) sigue existiendo por la
    // definición del modelo; agregamos además el índice case-insensitive
    // real, que es el que importa a partir de ahora.
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_lower_unique ON "usuarios" (LOWER(email));`
    );

    // ── perfiles ─────────────────────────────────────────────────────────
    await queryInterface.addColumn('perfiles', 'legajo', { type: DataTypes.STRING(20), allowNull: true, unique: true });
    await queryInterface.addConstraint('perfiles', {
      fields: ['usuarioId'], type: 'unique', name: 'unique_perfil_usuario',
    });

    // ── empresas ─────────────────────────────────────────────────────────
    await queryInterface.addColumn('empresas', 'deletedAt', { type: DataTypes.DATE, allowNull: true });
    await queryInterface.addColumn('empresas', 'aprobadaPorUsuarioId', {
      type: DataTypes.INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' },
    });
    await queryInterface.addColumn('empresas', 'aprobadaEn', { type: DataTypes.DATE, allowNull: true });
    await queryInterface.addColumn('empresas', 'motivoRechazo', { type: DataTypes.TEXT, allowNull: true });
    await queryInterface.addConstraint('empresas', {
      fields: ['usuarioId'], type: 'unique', name: 'unique_empresa_usuario_dueno',
    });

    // cuit: limpiar valores existentes (sacar todo lo que no sea dígito),
    // achicar el tipo a 11 y agregar CHECK + UNIQUE. Si dos empresas
    // demo terminan con el mismo cuit "limpio" (poco probable con datos
    // ficticios, pero posible), se resetean a NULL antes del UNIQUE para
    // no romper la migración — quedan pendientes de carga manual.
    await queryInterface.sequelize.query(`UPDATE "empresas" SET cuit = NULLIF(regexp_replace(cuit, '[^0-9]', '', 'g'), '') WHERE cuit IS NOT NULL;`);
    await queryInterface.sequelize.query(`UPDATE "empresas" SET cuit = NULL WHERE cuit IS NOT NULL AND length(cuit) <> 11;`);
    await queryInterface.sequelize.query(`
      UPDATE "empresas" e SET cuit = NULL
      WHERE cuit IS NOT NULL AND cuit IN (
        SELECT cuit FROM "empresas" WHERE cuit IS NOT NULL GROUP BY cuit HAVING COUNT(*) > 1
      );
    `);
    await queryInterface.changeColumn('empresas', 'cuit', { type: DataTypes.STRING(11), allowNull: true });
    await queryInterface.sequelize.query(
      `ALTER TABLE "empresas" ADD CONSTRAINT chk_empresas_cuit_formato CHECK (cuit IS NULL OR cuit ~ '^[0-9]{11}$');`
    );
    await queryInterface.addConstraint('empresas', { fields: ['cuit'], type: 'unique', name: 'unique_empresas_cuit' });

    // ── ofertas ──────────────────────────────────────────────────────────
    await queryInterface.addColumn('ofertas', 'deletedAt', { type: DataTypes.DATE, allowNull: true });

    // ── configuracion_institucional ─────────────────────────────────────
    await queryInterface.createTable('configuracion_institucional', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      clave: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      valor: { type: DataTypes.TEXT, allowNull: false },
      tipo: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'string' },
      descripcion: { type: DataTypes.TEXT, allowNull: true },
      editablePorAdmin: { type: DataTypes.BOOLEAN, defaultValue: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.bulkInsert('configuracion_institucional', [{
      clave: 'legajo.regex',
      valor: '^[A-Z0-9-]{3,20}$',
      tipo: 'string',
      descripcion: 'Regex de formato válido de legajo (alumno/egresado), normalizado a mayúsculas antes de validar. Ajustar acá si el formato real del instituto difiere del default — no requiere migración ni deploy.',
      editablePorAdmin: true,
      createdAt: new Date(), updatedAt: new Date(),
    }]);
  },

  async down(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;
    await queryInterface.dropTable('configuracion_institucional');

    await queryInterface.removeColumn('ofertas', 'deletedAt');

    await queryInterface.removeConstraint('empresas', 'unique_empresas_cuit');
    await queryInterface.removeConstraint('empresas', 'chk_empresas_cuit_formato');
    await queryInterface.changeColumn('empresas', 'cuit', { type: DataTypes.STRING(20), allowNull: true });
    await queryInterface.removeConstraint('empresas', 'unique_empresa_usuario_dueno');
    await queryInterface.removeColumn('empresas', 'motivoRechazo');
    await queryInterface.removeColumn('empresas', 'aprobadaEn');
    await queryInterface.removeColumn('empresas', 'aprobadaPorUsuarioId');
    await queryInterface.removeColumn('empresas', 'deletedAt');

    await queryInterface.removeConstraint('perfiles', 'unique_perfil_usuario');
    await queryInterface.removeColumn('perfiles', 'legajo');

    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS usuarios_email_lower_unique;`);
    await queryInterface.removeColumn('usuarios', 'deletedAt');
    await queryInterface.removeColumn('usuarios', 'tokenVersion');
    await queryInterface.removeColumn('usuarios', 'tokenResetUsadoEn');
  },
};
