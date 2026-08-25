-- Migración 012: normalizar tipo de puesto y experiencia en ofertas (Etapa 4)
-- Fecha: 2026-05-28
--
-- Agrega 4 campos nuevos a la tabla ofertas para separar:
--   tipoPuesto         → pasante | trainee | junior
--   requiereExperiencia → true/false
--   experienciaDetalle  → texto libre opcional
--   carrerasDestinatarias → array de carreras del instituto
--
-- nivelExperiencia se mantiene como legacy (compatible con filtros existentes).
-- Todas las operaciones son ADD COLUMN IF NOT EXISTS — no destructivas, idempotentes.
--
-- Ejecutar:
--   psql -U postgres -d pasantias_db -f backend/migrations/012_oferta_tipo_puesto.sql

ALTER TABLE ofertas ADD COLUMN IF NOT EXISTS "tipoPuesto"            VARCHAR(20);
ALTER TABLE ofertas ADD COLUMN IF NOT EXISTS "requiereExperiencia"   BOOLEAN DEFAULT false;
ALTER TABLE ofertas ADD COLUMN IF NOT EXISTS "experienciaDetalle"    TEXT;
ALTER TABLE ofertas ADD COLUMN IF NOT EXISTS "carrerasDestinatarias" TEXT[] DEFAULT '{}';

-- Verificación
SELECT column_name, data_type, character_maximum_length, column_default
FROM information_schema.columns
WHERE table_name = 'ofertas'
  AND column_name IN ('tipoPuesto','requiereExperiencia','experienciaDetalle','carrerasDestinatarias')
ORDER BY column_name;
