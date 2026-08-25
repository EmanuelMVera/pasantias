'use strict';

/**
 * 002-indices.js — EST-08 Fase 2.
 *
 * Índices faltantes detectados por grep de `indexes:`/`unique: true` en los
 * modelos (EST-08 §5.1): solo empresa_usuarios, mensajes, usuarios.email y
 * postulaciones tenían índices propios — ofertas, notificaciones,
 * activity_logs y solicitudes_* no tenían ninguno, y Postgres no crea
 * índices automáticamente sobre columnas FK.
 *
 * CREATE INDEX CONCURRENTLY no puede correr dentro de una transacción —
 * por eso cada CREATE va como query suelta, sin envolver la migración en
 * `queryInterface.sequelize.transaction()`.
 */

module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);

    await q(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_postulaciones_oferta_estado ON "postulaciones" ("ofertaId", "estado");`);
    await q(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_postulaciones_usuario_created ON "postulaciones" ("usuarioId", "createdAt" DESC);`);

    await q(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ofertas_estado_publicacion ON "ofertas" ("estado", "fechaPublicacion" DESC);`);
    await q(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ofertas_empresa_estado ON "ofertas" ("empresaId", "estado");`);
    await q(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ofertas_moderada_estado ON "ofertas" ("moderada", "estado");`);
    await q(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ofertas_fecha_limite_activa ON "ofertas" ("fechaLimite") WHERE estado = 'activa';`);

    await q(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notificaciones_usuario_leida ON "notificaciones" ("usuarioId", "leida");`);
    await q(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notificaciones_usuario_created ON "notificaciones" ("usuarioId", "createdAt" DESC);`);

    await q(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_logs_usuario_created ON "activity_logs" ("usuarioId", "createdAt" DESC);`);
    await q(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_logs_entidad ON "activity_logs" ("entidad", "entidadId");`);

    await q(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_solicitudes_reclutador_empresa ON "solicitudes_reclutador" ("empresaId");`);
    await q(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_solicitudes_empresa_estado_created ON "solicitudes_empresa" ("estado", "createdAt");`);

    // Búsqueda de texto en ofertas — hoy el filtro de OfertasPage usa
    // ILIKE '%palabra%', que nunca puede usar un índice B-tree.
    await q(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ofertas_busqueda_texto ON "ofertas"
      USING GIN (to_tsvector('spanish', coalesce(titulo,'') || ' ' || coalesce(descripcion,'') || ' ' || coalesce(requisitos,'')));
    `);
  },

  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_ofertas_busqueda_texto;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_solicitudes_empresa_estado_created;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_solicitudes_reclutador_empresa;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_activity_logs_entidad;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_activity_logs_usuario_created;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_notificaciones_usuario_created;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_notificaciones_usuario_leida;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_ofertas_fecha_limite_activa;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_ofertas_moderada_estado;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_ofertas_empresa_estado;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_ofertas_estado_publicacion;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_postulaciones_usuario_created;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_postulaciones_oferta_estado;`);
  },
};
