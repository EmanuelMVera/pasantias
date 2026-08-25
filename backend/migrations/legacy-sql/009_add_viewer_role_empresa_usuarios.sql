-- ============================================================
-- Migración 009 — Agregar rol 'viewer' al ENUM de empresa_usuarios
-- Sistema de Gestión de Pasantías — v1.5
-- ============================================================
--
-- Agrega el valor 'viewer' al ENUM "enum_empresa_usuarios_rolInterno".
-- Es IDEMPOTENTE: puede ejecutarse múltiples veces sin romper datos.
--
-- Roles finales del ENUM:
--   propietario → el usuario que registró la empresa (se crea automáticamente al registrar)
--   gerente     → puede gestionar reclutadores y ver todas las ofertas
--   reclutador  → puede crear ofertas y gestionar postulantes
--   viewer      → solo lectura (ver dashboard, ofertas y postulaciones; no puede modificar)
-- ============================================================

DO $$
BEGIN
  -- Agrega 'viewer' al ENUM solo si todavía no existe
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'viewer'
      AND enumtypid = (
        SELECT oid FROM pg_type
        WHERE typname = 'enum_empresa_usuarios_rolInterno'
      )
  ) THEN
    ALTER TYPE "enum_empresa_usuarios_rolInterno" ADD VALUE 'viewer';
    RAISE NOTICE 'Valor ''viewer'' agregado al ENUM enum_empresa_usuarios_rolInterno.';
  ELSE
    RAISE NOTICE 'Valor ''viewer'' ya existe en el ENUM. Sin cambios.';
  END IF;
END
$$;

-- ── Verificación ──────────────────────────────────────────────
-- SELECT enumlabel FROM pg_enum
-- WHERE enumtypid = (
--   SELECT oid FROM pg_type
--   WHERE typname = 'enum_empresa_usuarios_rolInterno'
-- );
