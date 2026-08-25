-- Migración Etapa 2: simplificación de roles internos de empresa
-- Fecha: 2026-05-27
--
-- 1. Agrega el nuevo valor al ENUM (non-destructive)
-- 2. Migra los datos existentes
-- 3. Los valores propietario/gerente/viewer quedan en el tipo PG pero sin uso
--
-- Ejecutar: psql -U postgres -d pasantias_db -f backend/migrations/010_roles_internos_etapa2.sql

ALTER TYPE "enum_empresa_usuarios_rolInterno" ADD VALUE IF NOT EXISTS 'admin_empresa';

-- Migrar propietario y gerente → admin_empresa
UPDATE empresa_usuarios
SET "rolInterno" = 'admin_empresa'
WHERE "rolInterno" IN ('propietario', 'gerente');

-- Migrar viewer → reclutador
UPDATE empresa_usuarios
SET "rolInterno" = 'reclutador'
WHERE "rolInterno" = 'viewer';

-- Verificación
SELECT "rolInterno", COUNT(*) as total
FROM empresa_usuarios
GROUP BY "rolInterno"
ORDER BY "rolInterno";
