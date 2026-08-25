-- ============================================================
-- Migración 005 — Agregar nuevos estados al ENUM de postulaciones
-- Sistema de Gestión de Pasantías — v1.2
-- ============================================================
--
-- Agrega 'entrevista' y 'rechazado' al ENUM de estado de postulaciones.
-- Los valores legacy 'entrevista_programada' y 'no_seleccionado' se CONSERVAN
-- para compatibilidad con registros existentes.
--
-- Es IDEMPOTENTE: verifica la existencia antes de agregar.
-- ============================================================

-- ── 1. Agregar estado 'entrevista' ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'entrevista'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'enum_postulaciones_estado'
      )
  ) THEN
    ALTER TYPE "enum_postulaciones_estado" ADD VALUE 'entrevista';
    RAISE NOTICE 'Estado "entrevista" agregado al ENUM.';
  ELSE
    RAISE NOTICE 'Estado "entrevista" ya existe. Sin cambios.';
  END IF;
END
$$;

-- ── 2. Agregar estado 'rechazado' ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'rechazado'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'enum_postulaciones_estado'
      )
  ) THEN
    ALTER TYPE "enum_postulaciones_estado" ADD VALUE 'rechazado';
    RAISE NOTICE 'Estado "rechazado" agregado al ENUM.';
  ELSE
    RAISE NOTICE 'Estado "rechazado" ya existe. Sin cambios.';
  END IF;
END
$$;

-- ── Verificación ──────────────────────────────────────────────
-- SELECT enumlabel FROM pg_enum
-- WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_postulaciones_estado');
-- Resultado esperado: en_revision, preseleccionado, entrevista_programada,
--                     entrevista, no_seleccionado, rechazado, contratado
