-- ============================================================
-- Migración 004 — Agregar campos v1.2 a la tabla "ofertas"
-- Sistema de Gestión de Pasantías — v1.2
-- ============================================================
--
-- Agrega los campos del panel corporativo avanzado:
--   fechaPublicacion, cantidadVacantes, salario,
--   beneficios, modalidadExtendida
--
-- Es IDEMPOTENTE: usa ADD COLUMN IF NOT EXISTS.
-- ============================================================

-- ── 1. Fecha en que se publicó (o planea publicar) la oferta ──
ALTER TABLE ofertas
  ADD COLUMN IF NOT EXISTS "fechaPublicacion" TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- ── 2. Cantidad de vacantes disponibles ────────────────────────
ALTER TABLE ofertas
  ADD COLUMN IF NOT EXISTS "cantidadVacantes" INTEGER NOT NULL DEFAULT 1;

-- ── 3. Salario numérico (pesos ARS) ────────────────────────────
-- Permite ordenar/filtrar por rango salarial
ALTER TABLE ofertas
  ADD COLUMN IF NOT EXISTS salario INTEGER DEFAULT NULL;

-- ── 4. Beneficios adicionales del puesto ──────────────────────
ALTER TABLE ofertas
  ADD COLUMN IF NOT EXISTS beneficios TEXT DEFAULT NULL;

-- ── 5. Descripción extendida de modalidad de trabajo ──────────
ALTER TABLE ofertas
  ADD COLUMN IF NOT EXISTS "modalidadExtendida" VARCHAR(255) DEFAULT NULL;

-- ── Verificación ──────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'ofertas' ORDER BY ordinal_position;
