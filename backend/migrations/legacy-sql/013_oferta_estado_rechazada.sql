-- Migración 013: agregar valor 'rechazada' al ENUM de estado de ofertas
-- Necesario para la moderación post-publicación (Etapa 9).
-- IF NOT EXISTS evita error si ya se ejecutó manualmente.

ALTER TYPE "enum_ofertas_estado" ADD VALUE IF NOT EXISTS 'rechazada';
