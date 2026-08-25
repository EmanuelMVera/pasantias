-- Migración 011: normalizar solicitudes de empresa y reclutadores (Etapa 3)
-- Fecha: 2026-05-28
--
-- Agrega campos para separar:
--   - datos del responsable / admin_empresa (responsableNombre, etc.)
--   - sitio web de la empresa
--   - apellido en solicitudes de reclutador
--
-- El campo email de solicitudes_empresa se mantiene como email institucional/de contacto.
-- responsableEmail es el email de acceso/login del admin_empresa.
--
-- Todas las operaciones son ADD COLUMN IF NOT EXISTS — no destructivas, idempotentes.
--
-- Ejecutar:
--   psql -U postgres -d pasantias_db -f backend/migrations/011_solicitud_empresa_responsable.sql

-- ── solicitudes_empresa ───────────────────────────────────────────────────────
ALTER TABLE solicitudes_empresa ADD COLUMN IF NOT EXISTS "responsableNombre"   VARCHAR(150);
ALTER TABLE solicitudes_empresa ADD COLUMN IF NOT EXISTS "responsableApellido" VARCHAR(150);
ALTER TABLE solicitudes_empresa ADD COLUMN IF NOT EXISTS "responsableEmail"    VARCHAR(255);
ALTER TABLE solicitudes_empresa ADD COLUMN IF NOT EXISTS "responsableTelefono" VARCHAR(30);
ALTER TABLE solicitudes_empresa ADD COLUMN IF NOT EXISTS "responsableCargo"    VARCHAR(100);
ALTER TABLE solicitudes_empresa ADD COLUMN IF NOT EXISTS "sitioWeb"            VARCHAR(255);

-- ── solicitudes_reclutador ────────────────────────────────────────────────────
ALTER TABLE solicitudes_reclutador ADD COLUMN IF NOT EXISTS "apellido" VARCHAR(150);

-- Verificación
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name IN ('solicitudes_empresa', 'solicitudes_reclutador')
  AND column_name IN ('responsableNombre','responsableApellido','responsableEmail',
                      'responsableTelefono','responsableCargo','sitioWeb','apellido')
ORDER BY table_name, column_name;
