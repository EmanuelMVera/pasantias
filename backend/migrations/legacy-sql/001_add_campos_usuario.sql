-- ============================================================
-- Migración 001 — Agregar campos nuevos a la tabla "usuarios"
-- Sistema de Gestión de Pasantías — v1.1
-- ============================================================
--
-- Esta migración agrega:
--   1. El valor 'profesor' al ENUM de rol
--   2. Los campos: telefono, ubicacion, ultimoAcceso, fotoPerfil
--
-- Es IDEMPOTENTE: puede ejecutarse varias veces sin romper datos.
-- Usar en PRODUCCIÓN antes de reiniciar el servidor.
-- ============================================================

-- ── 1. Agregar 'profesor' al ENUM de rol ─────────────────────
-- PostgreSQL no permite DROP/ADD de valores de ENUM en una transacción normal,
-- por eso se usa un bloque DO con verificación previa.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'profesor'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'enum_usuarios_rol'
      )
  ) THEN
    ALTER TYPE "enum_usuarios_rol" ADD VALUE 'profesor';
    RAISE NOTICE 'Valor "profesor" agregado al ENUM enum_usuarios_rol.';
  ELSE
    RAISE NOTICE 'Valor "profesor" ya existe en enum_usuarios_rol. Sin cambios.';
  END IF;
END
$$;

-- ── 2. Agregar columna "telefono" ─────────────────────────────
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS telefono VARCHAR(30) DEFAULT NULL;

-- ── 3. Agregar columna "ubicacion" ───────────────────────────
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS ubicacion VARCHAR(150) DEFAULT NULL;

-- ── 4. Agregar columna "ultimoAcceso" ────────────────────────
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS "ultimoAcceso" TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- ── 5. Agregar columna "fotoPerfil" ──────────────────────────
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS "fotoPerfil" VARCHAR(255) DEFAULT NULL;

-- ── Verificación ──────────────────────────────────────────────
-- Ejecutar esta query para confirmar que los cambios se aplicaron:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'usuarios'
--   ORDER BY ordinal_position;
