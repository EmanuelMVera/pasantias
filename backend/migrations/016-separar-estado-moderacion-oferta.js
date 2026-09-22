'use strict';

/**
 * 016-separar-estado-moderacion-oferta.js — RBAC-04 / DB-03.
 *
 * `ofertas` mezclaba dos conceptos independientes en dos columnas:
 *   - `estado`    (STRING+CHECK: activa|pausada|rechazada|cerrada) — ciclo de
 *                 vida de la publicación, Y ADEMÁS el resultado de moderación
 *                 vía el valor 'rechazada'.
 *   - `moderada`  (BOOLEAN) — si el admin ya la revisó, sin poder expresar
 *                 una aprobación automática (auto_aprobada, a futuro).
 *
 * Esta migración los separa en dos ejes ortogonales:
 *   - `estado`           → activa | pausada | cerrada (SOLO ciclo de vida).
 *   - `estadoModeracion` → pendiente | aprobada | rechazada | auto_aprobada
 *                          (SOLO revisión institucional).
 *
 * Conversión de datos existentes (orden importa: 'rechazada' primero, porque
 * también reescribe `estado`):
 *   estado='rechazada'                    → estadoModeracion='rechazada', estado='pausada'
 *     (una oferta rechazada no está visible; 'pausada' es el estado de
 *     publicación más coherente para algo que nunca estuvo — ni va a estar —
 *     disponible públicamente)
 *   moderada=true,  estado != 'rechazada' → estadoModeracion='aprobada'
 *   moderada=false, estado != 'rechazada' → estadoModeracion='pendiente'
 *
 * `moderada` se elimina en esta misma migración — no hay despliegues
 * independientes que necesiten una ventana expand/contract acá (el código de
 * la app se actualiza en el mismo cambio), así que no tiene sentido dejar dos
 * fuentes de verdad ni un solo día. Mismo criterio que
 * 012-limpiar-residuos-legacy.js (limpieza de columna/constraint en un único
 * paso, con guard de datos).
 *
 * La parte de columnas/datos/constraints corre en una transacción propia
 * (NO vía `useTransaction` del runner) porque los índices `CONCURRENTLY` que
 * le siguen no pueden correr dentro de una transacción — mismo motivo que
 * 002-indices.js / 010-indices-escala.js. Por eso esta migración no declara
 * `module.exports.useTransaction`.
 */

module.exports.up = async (queryInterface, Sequelize) => {
  const { DataTypes } = Sequelize;

  await queryInterface.sequelize.transaction(async (t) => {
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

    await queryInterface.addColumn('ofertas', 'estadoModeracion', {
      type: DataTypes.STRING(20),
      defaultValue: 'pendiente',
    }, { transaction: t });

    // Backfill — 'rechazada' primero (caso especial que también reescribe estado).
    await q(`UPDATE "ofertas" SET "estadoModeracion" = 'rechazada' WHERE estado = 'rechazada'`);
    await q(`UPDATE "ofertas" SET "estadoModeracion" = 'aprobada'  WHERE estado != 'rechazada' AND moderada = true`);
    await q(`UPDATE "ofertas" SET "estadoModeracion" = 'pendiente' WHERE estado != 'rechazada' AND moderada = false`);
    // Ofertas rechazadas no estaban (ni van a estar) visibles — 'pausada' es
    // el estado de ciclo de vida coherente para esa publicación.
    await q(`UPDATE "ofertas" SET estado = 'pausada' WHERE estado = 'rechazada'`);

    await q(`ALTER TABLE "ofertas" DROP CONSTRAINT chk_ofertas_estado`);
    await q(`ALTER TABLE "ofertas" ADD CONSTRAINT chk_ofertas_estado
             CHECK (estado IN ('activa', 'pausada', 'cerrada'))`);
    await q(`ALTER TABLE "ofertas" ADD CONSTRAINT chk_ofertas_estado_moderacion
             CHECK ("estadoModeracion" IN ('pendiente', 'aprobada', 'rechazada', 'auto_aprobada'))`);

    await queryInterface.removeColumn('ofertas', 'moderada', { transaction: t });
  });

  // CONCURRENTLY no puede ir dentro de una transacción — corre después de que
  // la transacción de arriba ya confirmó (mismo criterio que 002/010).
  const q2 = (sql) => queryInterface.sequelize.query(sql);
  await q2(`DROP INDEX CONCURRENTLY IF EXISTS idx_ofertas_moderada_estado;`);
  await q2(`DROP INDEX CONCURRENTLY IF EXISTS idx_ofertas_estado_moderada_created;`);
  await q2(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ofertas_estadomoderacion_estado
    ON "ofertas" ("estadoModeracion", "estado");
  `);
  await q2(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ofertas_estado_estadomoderacion_created
    ON "ofertas" ("estado", "estadoModeracion", "createdAt" DESC)
    WHERE "deletedAt" IS NULL;
  `);
};

module.exports.down = async (queryInterface, Sequelize) => {
  const { DataTypes } = Sequelize;
  const q2 = (sql) => queryInterface.sequelize.query(sql);

  // Los índices nuevos se pueden dropear sin depender de que exista `moderada`.
  await q2(`DROP INDEX CONCURRENTLY IF EXISTS idx_ofertas_estado_estadomoderacion_created;`);
  await q2(`DROP INDEX CONCURRENTLY IF EXISTS idx_ofertas_estadomoderacion_estado;`);

  await queryInterface.sequelize.transaction(async (t) => {
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

    await queryInterface.addColumn('ofertas', 'moderada', {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    }, { transaction: t });

    // Los CHECK tienen que volver a su forma vieja ANTES de escribir
    // estado='rechazada' — el CHECK nuevo (3 valores) todavía no lo admite.
    await q(`ALTER TABLE "ofertas" DROP CONSTRAINT chk_ofertas_estado_moderacion`);
    await q(`ALTER TABLE "ofertas" DROP CONSTRAINT chk_ofertas_estado`);
    await q(`ALTER TABLE "ofertas" ADD CONSTRAINT chk_ofertas_estado
             CHECK (estado IN ('activa', 'pausada', 'rechazada', 'cerrada'))`);

    await q(`UPDATE "ofertas" SET moderada = ("estadoModeracion" IN ('aprobada', 'auto_aprobada'))`);
    // Una oferta con estadoModeracion='rechazada' solo pudo llegar ahí desde
    // estado='rechazada' (única fuente de esa combinación en el up()) —
    // reversión exacta, no una aproximación.
    await q(`UPDATE "ofertas" SET estado = 'rechazada' WHERE "estadoModeracion" = 'rechazada'`);

    await queryInterface.removeColumn('ofertas', 'estadoModeracion', { transaction: t });
  });

  // Recrear los índices viejos ahora que `moderada` volvió a existir.
  await q2(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ofertas_moderada_estado ON "ofertas" ("moderada", "estado");`);
  await q2(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ofertas_estado_moderada_created
    ON "ofertas" ("estado", "moderada", "createdAt" DESC)
    WHERE "deletedAt" IS NULL;
  `);
};
