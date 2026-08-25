-- ============================================================
-- Migración 008 — Agregar campos v1.3 a la tabla "notificaciones"
-- Sistema de Gestión de Pasantías — v1.3
-- ============================================================
--
-- Agrega: prioridad, tipoVisual, accionURL
-- Agrega: 'aval' y 'chat' al ENUM del tipo de notificación
-- ============================================================

-- ── 1. Agregar 'aval' al ENUM tipo ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'aval'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_notificaciones_tipo')
  ) THEN
    ALTER TYPE "enum_notificaciones_tipo" ADD VALUE 'aval';
  END IF;
END
$$;

-- ── 2. Agregar 'chat' al ENUM tipo ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'chat'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_notificaciones_tipo')
  ) THEN
    ALTER TYPE "enum_notificaciones_tipo" ADD VALUE 'chat';
  END IF;
END
$$;

-- ── 3. Crear ENUM prioridad ───────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_notificaciones_prioridad') THEN
    CREATE TYPE "enum_notificaciones_prioridad" AS ENUM ('baja', 'normal', 'alta', 'urgente');
  END IF;
END
$$;

-- ── 4. Crear ENUM tipoVisual ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_notificaciones_tipoVisual') THEN
    CREATE TYPE "enum_notificaciones_tipoVisual" AS ENUM ('info', 'success', 'warning', 'error');
  END IF;
END
$$;

-- ── 5. Agregar columna prioridad ──────────────────────────────
ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS prioridad "enum_notificaciones_prioridad" NOT NULL DEFAULT 'normal';

-- ── 6. Agregar columna tipoVisual ─────────────────────────────
ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS "tipoVisual" "enum_notificaciones_tipoVisual" NOT NULL DEFAULT 'info';

-- ── 7. Agregar columna accionURL ──────────────────────────────
ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS "accionURL" VARCHAR(255) DEFAULT NULL;

-- ── Verificación ──────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'notificaciones' ORDER BY ordinal_position;
