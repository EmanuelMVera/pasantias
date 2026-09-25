'use strict';

/**
 * 019-eliminar-empresa-usuarioid.js — RBAC-06.
 *
 * `empresas.usuarioId` ("dueño directo") y `empresa_usuarios` (equipo real,
 * con `rolInterno`) coexisten desde el baseline mismo del esquema — nunca
 * uno reemplazó al otro. El modelo definitivo usa EXCLUSIVAMENTE
 * `empresa_usuarios`: toda persona asociada a una empresa debe tener una
 * fila ahí (`rolInterno='admin_empresa'` para quien la representa
 * institucionalmente, `'reclutador'` para el resto).
 *
 * Pasos, en orden, dentro de una única transacción (tablas chicas — no hace
 * falta CONCURRENTLY):
 *   1. Backfill: por cada empresa sin fila correspondiente en
 *      empresa_usuarios para su usuarioId, se crea una con
 *      rolInterno='admin_empresa', activo=true. En la práctica no debería
 *      afectar filas — el flujo de aprobación de empresa
 *      (solicitudEmpresa.service.js) y los 4 seeds que crean empresas ya
 *      escriben ambos mecanismos en el mismo paso — pero es la garantía
 *      pedida explícitamente para datos históricos.
 *   2. Validación: aborta (RAISE EXCEPTION) si después del backfill queda
 *      alguna empresa sin ningún admin_empresa activo — "fallar de forma
 *      informativa antes de perder datos", nunca perder una empresa en
 *      silencio.
 *   3. Reemplaza la garantía que daba `unique_empresa_usuario_dueno` sobre
 *      empresas.usuarioId (un usuario no puede ser dueño/admin_empresa de
 *      más de una empresa) por un índice único PARCIAL sobre
 *      empresa_usuarios, en la tabla correcta.
 *   4. Recién ahí se elimina `empresas.usuarioId` — Postgres dropea en
 *      cascada su UNIQUE y su FK (viven solo sobre esa columna).
 */

module.exports.up = async (queryInterface, Sequelize) => {
  const { DataTypes } = Sequelize;

  await queryInterface.sequelize.transaction(async (t) => {
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

    // 1. Backfill — empresas cuyo dueño directo no tiene fila en empresa_usuarios.
    await q(`
      INSERT INTO "empresa_usuarios" ("empresaId", "usuarioId", "rolInterno", "activo", "createdAt", "updatedAt")
      SELECT e.id, e."usuarioId", 'admin_empresa', true, NOW(), NOW()
      FROM "empresas" e
      WHERE NOT EXISTS (
        SELECT 1 FROM "empresa_usuarios" eu
        WHERE eu."empresaId" = e.id AND eu."usuarioId" = e."usuarioId"
      );
    `);

    // 2. Validación — ninguna empresa puede quedar sin admin_empresa activo.
    await q(`
      DO $$
      DECLARE huerfanas INT;
      DECLARE ids TEXT;
      BEGIN
        SELECT COUNT(*), string_agg(e.id::text, ', ') INTO huerfanas, ids
        FROM "empresas" e
        WHERE NOT EXISTS (
          SELECT 1 FROM "empresa_usuarios" eu
          WHERE eu."empresaId" = e.id AND eu."rolInterno" = 'admin_empresa' AND eu.activo = true
        );
        IF huerfanas > 0 THEN
          RAISE EXCEPTION 'Hay % empresa(s) sin admin_empresa activo tras el backfill (ids: %) — abortando antes de eliminar empresas.usuarioId.', huerfanas, ids;
        END IF;
      END $$;
    `);

    // 3. Reemplazo del constraint — mueve la garantía "un usuario, a lo sumo
    // una empresa como dueño/admin_empresa" a la tabla correcta.
    await q(`
      CREATE UNIQUE INDEX unique_admin_empresa_por_usuario
      ON "empresa_usuarios" ("usuarioId")
      WHERE "rolInterno" = 'admin_empresa';
    `);

    // 4. Recién ahora se elimina la columna — Postgres dropea en cascada su
    // UNIQUE (unique_empresa_usuario_dueno) y su FK (empresas_usuarioId_fkey).
    await queryInterface.removeColumn('empresas', 'usuarioId', { transaction: t });
  });
};

module.exports.down = async (queryInterface, Sequelize) => {
  const { DataTypes } = Sequelize;

  await queryInterface.sequelize.transaction(async (t) => {
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

    await queryInterface.addColumn('empresas', 'usuarioId', {
      type: DataTypes.INTEGER,
      allowNull: true, // temporalmente, hasta backfillear
    }, { transaction: t });

    // Backfill desde empresa_usuarios: el admin_empresa más antiguo de cada
    // empresa (en el modelo nuevo debería haber exactamente uno).
    await q(`
      UPDATE "empresas" e
      SET "usuarioId" = sub."usuarioId"
      FROM (
        SELECT DISTINCT ON (eu."empresaId") eu."empresaId", eu."usuarioId"
        FROM "empresa_usuarios" eu
        WHERE eu."rolInterno" = 'admin_empresa'
        ORDER BY eu."empresaId", eu."createdAt" ASC
      ) sub
      WHERE e.id = sub."empresaId";
    `);

    await q(`
      DO $$
      DECLARE sinUsuario INT;
      BEGIN
        SELECT COUNT(*) INTO sinUsuario FROM "empresas" WHERE "usuarioId" IS NULL;
        IF sinUsuario > 0 THEN
          RAISE EXCEPTION 'Hay % empresa(s) sin admin_empresa en empresa_usuarios — no se puede reconstruir empresas.usuarioId.', sinUsuario;
        END IF;
      END $$;
    `);

    await q(`ALTER TABLE "empresas" ALTER COLUMN "usuarioId" SET NOT NULL;`);
    await q(`ALTER TABLE "empresas" ADD CONSTRAINT unique_empresa_usuario_dueno UNIQUE ("usuarioId");`);
    await q(`
      ALTER TABLE "empresas"
      ADD CONSTRAINT "empresas_usuarioId_fkey" FOREIGN KEY ("usuarioId")
      REFERENCES "usuarios" (id) ON DELETE CASCADE;
    `);

    await q(`DROP INDEX IF EXISTS unique_admin_empresa_por_usuario;`);
  });
};
