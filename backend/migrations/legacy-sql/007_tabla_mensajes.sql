-- ============================================================
-- Migración 007 — Crear tabla "mensajes" (chat directo)
-- Sistema de Gestión de Pasantías — v1.3
-- ============================================================
-- Es IDEMPOTENTE: puede ejecutarse múltiples veces sin romper datos.
-- ============================================================

CREATE TABLE IF NOT EXISTS mensajes (
  id            SERIAL PRIMARY KEY,
  "emisorId"    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  "receptorId"  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  mensaje       TEXT NOT NULL CHECK (char_length(mensaje) BETWEEN 1 AND 2000),
  leido         BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ── Índices para acelerar consultas de conversación ──────────
CREATE INDEX IF NOT EXISTS idx_mensajes_emisor             ON mensajes ("emisorId");
CREATE INDEX IF NOT EXISTS idx_mensajes_receptor           ON mensajes ("receptorId");
CREATE INDEX IF NOT EXISTS idx_mensajes_conversacion       ON mensajes ("emisorId", "receptorId");
CREATE INDEX IF NOT EXISTS idx_mensajes_no_leidos          ON mensajes ("receptorId", leido);
CREATE INDEX IF NOT EXISTS idx_mensajes_created            ON mensajes ("createdAt" DESC);

-- ── Verificación ──────────────────────────────────────────────
-- SELECT * FROM mensajes LIMIT 5;
