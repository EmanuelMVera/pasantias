-- ============================================================
-- Migración 006 — Crear tabla "avales"
-- Sistema de Gestión de Pasantías — v1.3
-- ============================================================
-- Es IDEMPOTENTE: puede ejecutarse múltiples veces sin romper datos.
-- ============================================================

-- ── 1. Crear el ENUM de estado ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_avales_estado') THEN
    CREATE TYPE "enum_avales_estado" AS ENUM ('pendiente', 'aprobado', 'rechazado');
    RAISE NOTICE 'ENUM "enum_avales_estado" creado.';
  ELSE
    RAISE NOTICE 'ENUM ya existe. Sin cambios.';
  END IF;
END
$$;

-- ── 2. Crear la tabla avales ──────────────────────────────────
CREATE TABLE IF NOT EXISTS avales (
  id               SERIAL PRIMARY KEY,
  "postulacionId"  INTEGER NOT NULL REFERENCES postulaciones(id) ON DELETE CASCADE,
  "profesorId"     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  estado           "enum_avales_estado" NOT NULL DEFAULT 'pendiente',
  comentario       TEXT DEFAULT NULL,
  "fechaRevision"  TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  -- Un profesor no puede avalar la misma postulación dos veces
  CONSTRAINT unique_aval_postulacion_profesor UNIQUE ("postulacionId", "profesorId")
);

-- ── 3. Índices ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_avales_postulacion ON avales ("postulacionId");
CREATE INDEX IF NOT EXISTS idx_avales_profesor     ON avales ("profesorId");
CREATE INDEX IF NOT EXISTS idx_avales_estado       ON avales (estado);

-- ── Verificación ──────────────────────────────────────────────
-- SELECT * FROM avales LIMIT 5;
