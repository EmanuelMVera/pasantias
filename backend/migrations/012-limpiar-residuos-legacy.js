'use strict';

/**
 * 012-limpiar-residuos-legacy.js — DB-02.
 *
 * Limpia dos residuos de features desmontadas en el baseline (EST-08):
 *
 * A. `'aval'` en `chk_notificaciones_tipo` — valor del CHECK sin ningún emisor
 *    en el código (la feature "Avales Académicos" se desmontó). Se endurece el
 *    CHECK sacándolo. Guard: aborta si hay filas con `tipo='aval'` (hoy = 0).
 *
 * B. Tabla `avales` — el `000-baseline` NUNCA la creó (no tiene modelo ni
 *    código). Solo puede existir en una base vieja de `sync({alter:true})`
 *    adoptada vía `scripts/adopt-baseline.js`. Se dropea SOLO si existe y está
 *    VACÍA; si tiene filas → RAISE EXCEPTION (seguridad de datos > limpieza).
 *    En el esquema canónico esta parte es un no-op total.
 *
 * NO toca ningún ENUM de Postgres (regla DB-02). El único DROP TYPE es el del
 * tipo huérfano `enum_avales_estado` (creado por legacy-sql/006), y solo si ya
 * no lo usa ninguna columna.
 */

module.exports.useTransaction = true;

module.exports.up = async (queryInterface, Sequelize, t) => {
  const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

  // ── Parte A: 'aval' fuera de chk_notificaciones_tipo ──────────────────────
  const [filas] = await q(`SELECT count(*)::int AS n FROM "notificaciones" WHERE tipo = 'aval'`);
  if (filas[0].n > 0) {
    throw new Error(
      `Hay ${filas[0].n} notificaciones con tipo='aval'. Reclasificalas (p. ej. a 'sistema') antes de correr esta migración.`,
    );
  }
  await q(`ALTER TABLE "notificaciones" DROP CONSTRAINT chk_notificaciones_tipo`);
  await q(`
    ALTER TABLE "notificaciones" ADD CONSTRAINT chk_notificaciones_tipo
    CHECK (tipo IN ('postulacion', 'estado', 'oferta', 'chat', 'sistema'))
  `);

  // ── Parte B: DROP TABLE avales (guardado) — no-op en el esquema canónico ──
  await q(`
    DO $$
    DECLARE filas_avales int;
    BEGIN
      IF to_regclass('public.avales') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM avales' INTO filas_avales;
        IF filas_avales > 0 THEN
          RAISE EXCEPTION 'La tabla "avales" tiene % filas — no se borra automáticamente. Archivala y borrala a mano.', filas_avales;
        END IF;
        DROP TABLE avales;
        RAISE NOTICE 'Tabla "avales" (vacía) eliminada.';
      END IF;
      -- Tipo huérfano de legacy-sql/006; solo si ninguna columna lo usa.
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_avales_estado') THEN
        DROP TYPE enum_avales_estado;
      END IF;
    END $$;
  `);
};

module.exports.down = async (queryInterface, Sequelize, t) => {
  const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

  // Parte A revertible: 'aval' vuelve al CHECK.
  await q(`ALTER TABLE "notificaciones" DROP CONSTRAINT chk_notificaciones_tipo`);
  await q(`
    ALTER TABLE "notificaciones" ADD CONSTRAINT chk_notificaciones_tipo
    CHECK (tipo IN ('postulacion', 'estado', 'oferta', 'aval', 'chat', 'sistema'))
  `);

  // Parte B: NO se recrea `avales`. Era una tabla de una feature desmontada; su
  // ausencia ES el estado canónico. Recrearla (con FKs a usuarios/postulaciones)
  // rompería el down() de 000-baseline en la cadena `down --to 000` del CI.
};
