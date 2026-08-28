'use strict';

/**
 * 010-indices-escala.js — SCALE-02 (Etapa 26).
 *
 * Índices aprobados en la auditoría SCALE-01 para soportar miles de
 * alumnos/egresados y múltiples empresas concurrentes. Cada índice de acá
 * responde a una query concreta ya existente en el código (no se inventan
 * índices "por las dudas"):
 *
 *   idx_usuarios_rol_activo              admin.service.js:20-24  (counts de dashboard por rol/activo)
 *                                        oferta.service.js:145   (findAll admins activos)
 *   idx_usuarios_created                 adminUsuarios.service.js:40  (ORDER BY createdAt DESC sin filtro)
 *   idx_usuarios_token_reset             auth.controller.js:135  (findOne por tokenReset)
 *   idx_usuarios_{nombre,apellido,email}_trgm
 *                                        adminUsuarios.service.js:30-34 / chat.service.js:79-83  (ILIKE '%q%')
 *   idx_empresa_usuarios_usuario_activo  empresa.middleware.js:81, empresa.service.js:13,
 *                                        chatPermission.service.js:12, chat.service.js:31/51,
 *                                        archivo.service.js:31  (findOne por usuarioId sin índice → seq scan)
 *   idx_empresas_aprobacion_pendiente    adminModeracion.service.js:33  (where estadoAprobacion='pendiente')
 *   idx_ofertas_estado_moderada_created  oferta.controller.js:23-27, adminModeracion.service.js:76-80
 *   idx_ofertas_habilidades_gin          oferta.service.js:81/123  (Op.overlap sobre habilidadesRequeridas)
 *   idx_ofertas_carreras_gin             oferta.service.js:78      (Op.contains sobre carrerasDestinatarias)
 *   idx_postulaciones_usuario_estado     postulacion.service.js:98-103  (6 counts por usuarioId+estado)
 *   idx_postulaciones_oferta_updated     empresa.service.js:123   (ORDER BY updatedAt DESC)
 *   idx_postulaciones_created            admin.service.js:36-38   (actividadReciente, ORDER BY createdAt DESC)
 *   idx_mensajes_emisor_created /        chat.service.js:174-182 y :258-268
 *   idx_mensajes_receptor_created        (OR emisor/receptor + ORDER BY createdAt DESC LIMIT)
 *   idx_activity_logs_created            admin.service.js:74/106  (ORDER BY createdAt DESC sin filtro por usuarioId)
 *
 * NOTAS DE POSTGRESQL
 * ------------------
 * - Todos los CREATE/DROP van CONCURRENTLY: no bloquean escrituras sobre la
 *   tabla. CONCURRENTLY NO puede correr dentro de una transacción — por eso,
 *   igual que 002-indices.js, esta migración NO usa
 *   queryInterface.sequelize.transaction(); cada sentencia va suelta.
 * - Si un build CONCURRENTLY se interrumpe, Postgres deja un índice INVÁLIDO
 *   (pg_index.indisvalid = false) que IF NOT EXISTS no reconstruye. Ante una
 *   interrupción: `DROP INDEX CONCURRENTLY <nombre>;` a mano y volver a correr.
 * - Índices parciales `WHERE "deletedAt" IS NULL`: los modelos usuarios/ofertas/
 *   empresas son `paranoid`, así que TODA query de la app ya filtra
 *   `deletedAt IS NULL`. El índice parcial es más chico y igual de útil.
 * - gin_trgm_ops (extensión pg_trgm) habilita que `ILIKE '%q%'` use índice —
 *   un B-tree nunca puede con comodín a la izquierda. Precedente de extensión
 *   en migración: 003-archivos.js (pgcrypto). El down() NO desinstala pg_trgm
 *   (mismo criterio que 003 con pgcrypto).
 *
 * IMPACTO EN ESCRITURITAS (analizado, ver SCALE-01 §4)
 * --------------------------------------------------
 * - `usuarios`: el UPDATE de `ultimoAcceso` en cada request (SCALE-01 #2) NO
 *   toca ninguna columna indexada por estos índices → sigue siendo HOT update,
 *   sin costo de mantenimiento de índice. Los índices trigram sí encarecen el
 *   alta/edición de usuario (baja frecuencia).
 * - `ofertas`: `increment('vistas')` (SCALE-01 #20) no toca columnas indexadas
 *   acá → sigue HOT.
 * - `postulaciones`: `updateEstado` ahora mantiene 2 índices extra
 *   (idx_postulaciones_usuario_estado por `estado`, idx_postulaciones_oferta_updated
 *   por `updatedAt`). Frecuencia media (empresa revisando candidatos). Aceptable.
 * - `activity_logs`: append-only de alto volumen; +1 índice a mantener por
 *   INSERT. El fix de fondo (retención/particionado) es SCALE-05.
 *
 * ÍNDICES ELIMINADOS (con análisis — regla SCALE-02)
 * ------------------------------------------------
 * - `mensajes_emisor_idx (emisorId)` y `mensajes_receptor_idx (receptorId)`
 *   (creados en 000-baseline) quedan REDUNDANTES al agregar
 *   idx_mensajes_emisor_created (emisorId, "createdAt" DESC) y
 *   idx_mensajes_receptor_created (receptorId, "createdAt" DESC): un índice
 *   compuesto con esa columna como prefijo sirve TODAS las búsquedas por
 *   igualdad sobre esa columna que hacían los índices simples. Se reemplazan
 *   (primero se crean los nuevos, después se dropean los viejos: nunca hay
 *   ventana sin índice sobre emisorId/receptorId). `mensajes_emisor_receptor_idx`
 *   y `mensajes_receptor_leido_idx` se conservan (sirven queries distintas:
 *   par exacto emisor+receptor y conteo de no leídos).
 *
 * NO se toca ningún otro índice existente.
 */

module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);

    // ── usuarios ────────────────────────────────────────────────────────────
    await q(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usuarios_rol_activo
      ON "usuarios" ("rol", "activo")
      WHERE "deletedAt" IS NULL;
    `);
    await q(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usuarios_created
      ON "usuarios" ("createdAt" DESC)
      WHERE "deletedAt" IS NULL;
    `);
    await q(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usuarios_token_reset
      ON "usuarios" ("tokenReset")
      WHERE "tokenReset" IS NOT NULL;
    `);

    // Búsqueda por texto en el panel admin y en el buscador de chat: hoy
    // `nombre/apellido/email ILIKE '%q%'` hace seq scan sobre usuarios.
    await q(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    await q(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usuarios_nombre_trgm
      ON "usuarios" USING gin ("nombre" gin_trgm_ops);
    `);
    await q(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usuarios_apellido_trgm
      ON "usuarios" USING gin ("apellido" gin_trgm_ops);
    `);
    await q(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usuarios_email_trgm
      ON "usuarios" USING gin ("email" gin_trgm_ops);
    `);

    // ── empresa_usuarios ───────────────────────────────────────────────────
    // El UNIQUE (empresaId, usuarioId) arranca por empresaId → NO sirve para
    // buscar por usuarioId solo, que es el patrón de verifyEmpresaMember y de
    // los chequeos de permiso de chat (una vez por request del panel empresa).
    await q(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_empresa_usuarios_usuario_activo
      ON "empresa_usuarios" ("usuarioId", "activo");
    `);

    // ── empresas ───────────────────────────────────────────────────────────
    await q(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_empresas_aprobacion_pendiente
      ON "empresas" ("estadoAprobacion")
      WHERE "estadoAprobacion" = 'pendiente';
    `);

    // ── ofertas ────────────────────────────────────────────────────────────
    // GET /api/ofertas (pública): where estado='activa' AND moderada=true
    // ORDER BY createdAt DESC. Ningún índice existente cubre ese orden.
    await q(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ofertas_estado_moderada_created
      ON "ofertas" ("estado", "moderada", "createdAt" DESC)
      WHERE "deletedAt" IS NULL;
    `);
    // Recomendadas: habilidadesRequeridas && ARRAY[...] / carrerasDestinatarias @> ARRAY[...]
    await q(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ofertas_habilidades_gin
      ON "ofertas" USING gin ("habilidadesRequeridas")
      WHERE "deletedAt" IS NULL;
    `);
    await q(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ofertas_carreras_gin
      ON "ofertas" USING gin ("carrerasDestinatarias")
      WHERE "deletedAt" IS NULL;
    `);

    // ── postulaciones ──────────────────────────────────────────────────────
    await q(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_postulaciones_usuario_estado
      ON "postulaciones" ("usuarioId", "estado");
    `);
    await q(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_postulaciones_oferta_updated
      ON "postulaciones" ("ofertaId", "updatedAt" DESC);
    `);
    await q(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_postulaciones_created
      ON "postulaciones" ("createdAt" DESC);
    `);

    // ── mensajes ───────────────────────────────────────────────────────────
    // Crear los compuestos ANTES de dropear los simples (sin ventana sin índice).
    await q(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mensajes_emisor_created
      ON "mensajes" ("emisorId", "createdAt" DESC);
    `);
    await q(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mensajes_receptor_created
      ON "mensajes" ("receptorId", "createdAt" DESC);
    `);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS mensajes_emisor_idx;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS mensajes_receptor_idx;`);

    // ── activity_logs ──────────────────────────────────────────────────────
    await q(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_logs_created
      ON "activity_logs" ("createdAt" DESC);
    `);
  },

  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);

    // Restaurar los índices simples de mensajes ANTES de dropear los compuestos.
    await q(`CREATE INDEX CONCURRENTLY IF NOT EXISTS mensajes_emisor_idx ON "mensajes" ("emisorId");`);
    await q(`CREATE INDEX CONCURRENTLY IF NOT EXISTS mensajes_receptor_idx ON "mensajes" ("receptorId");`);

    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_activity_logs_created;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_mensajes_receptor_created;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_mensajes_emisor_created;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_postulaciones_created;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_postulaciones_oferta_updated;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_postulaciones_usuario_estado;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_ofertas_carreras_gin;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_ofertas_habilidades_gin;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_ofertas_estado_moderada_created;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_empresas_aprobacion_pendiente;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_empresa_usuarios_usuario_activo;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_usuarios_email_trgm;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_usuarios_apellido_trgm;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_usuarios_nombre_trgm;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_usuarios_token_reset;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_usuarios_created;`);
    await q(`DROP INDEX CONCURRENTLY IF EXISTS idx_usuarios_rol_activo;`);
    // pg_trgm NO se desinstala (mismo criterio que 003-archivos.js con pgcrypto).
  },
};
