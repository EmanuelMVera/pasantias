-- ============================================================
-- Migración 003 — Crear tabla "empresa_usuarios"
-- Sistema de Gestión de Pasantías — v1.2
-- ============================================================
--
-- Crea la tabla de membresías del equipo de reclutadores de una empresa.
-- Es IDEMPOTENTE: puede ejecutarse múltiples veces sin romper datos.
-- ============================================================

-- ── 1. Crear el ENUM de rol interno (si no existe) ────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_empresa_usuarios_rolInterno') THEN
    CREATE TYPE "enum_empresa_usuarios_rolInterno" AS ENUM ('propietario', 'gerente', 'reclutador');
    RAISE NOTICE 'ENUM "enum_empresa_usuarios_rolInterno" creado.';
  ELSE
    RAISE NOTICE 'ENUM ya existe. Sin cambios.';
  END IF;
END
$$;

-- ── 2. Crear la tabla empresa_usuarios ───────────────────────
CREATE TABLE IF NOT EXISTS empresa_usuarios (
  id           SERIAL PRIMARY KEY,
  "empresaId"  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  "usuarioId"  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  "rolInterno" "enum_empresa_usuarios_rolInterno" NOT NULL DEFAULT 'reclutador',
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  -- Un usuario no puede tener dos membresías en la misma empresa
  CONSTRAINT unique_empresa_usuario UNIQUE ("empresaId", "usuarioId")
);

-- ── 3. Índices para mejorar performance de las queries más comunes ─
CREATE INDEX IF NOT EXISTS idx_empresa_usuarios_empresa ON empresa_usuarios ("empresaId");
CREATE INDEX IF NOT EXISTS idx_empresa_usuarios_usuario ON empresa_usuarios ("usuarioId");
CREATE INDEX IF NOT EXISTS idx_empresa_usuarios_activo  ON empresa_usuarios ("empresaId", activo);

-- ── Verificación ──────────────────────────────────────────────
-- SELECT * FROM empresa_usuarios LIMIT 5;
