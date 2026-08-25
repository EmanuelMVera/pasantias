-- ============================================================
-- Migración 002 — Agregar campos nuevos a la tabla "perfiles"
-- Sistema de Gestión de Pasantías — v1.1
-- ============================================================
--
-- Esta migración agrega los siguientes campos al modelo Perfil:
--   portfolio, preferenciasLaborales, salarioPretendido,
--   visibilidadPerfil, experienciaLaboral, proyectos,
--   certificaciones, redesSociales
--
-- Es IDEMPOTENTE: puede ejecutarse varias veces sin romper datos.
-- Usar en PRODUCCIÓN antes de reiniciar el servidor.
-- ============================================================

-- ── 1. URL del portfolio personal ────────────────────────────
ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS portfolio VARCHAR(255) DEFAULT NULL;

-- ── 2. Preferencias laborales (texto libre) ──────────────────
ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS "preferenciasLaborales" TEXT DEFAULT NULL;

-- ── 3. Pretensión salarial ───────────────────────────────────
ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS "salarioPretendido" VARCHAR(100) DEFAULT NULL;

-- ── 4. Visibilidad del perfil para empresas ──────────────────
-- true = visible; false = oculto (solo el usuario y el admin lo ven)
ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS "visibilidadPerfil" BOOLEAN NOT NULL DEFAULT TRUE;

-- ── 5. Historial de experiencia laboral (texto libre / Markdown)
ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS "experienciaLaboral" TEXT DEFAULT NULL;

-- ── 6. Proyectos realizados (texto libre / Markdown) ─────────
ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS proyectos TEXT DEFAULT NULL;

-- ── 7. Certificaciones obtenidas (array de strings) ──────────
ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS certificaciones TEXT[] NOT NULL DEFAULT '{}';

-- ── 8. Redes sociales adicionales (JSONB) ────────────────────
-- Formato esperado: {"twitter": "https://...", "behance": "https://..."}
ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS "redesSociales" JSONB DEFAULT NULL;

-- ── Verificación ──────────────────────────────────────────────
-- Ejecutar esta query para confirmar que los cambios se aplicaron:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'perfiles'
--   ORDER BY ordinal_position;
