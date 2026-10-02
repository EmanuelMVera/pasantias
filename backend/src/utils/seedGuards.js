'use strict';

/**
 * seedGuards.js — DEPLOY-01.
 *
 * Guards comunes de los seeds: que no corran (o no destruyan datos) en
 * producción por accidente, y que no siembren sobre un esquema desactualizado.
 */

const { config } = require('../config/env');

/**
 * Aborta el proceso si corre en producción sin confirmación explícita.
 *
 * @param {string} nombre  nombre del comando (para el mensaje de error)
 * @param {{ overrideEnv?: string }} [opts]  si se pasa `overrideEnv`, la variable
 *        de entorno cuyo valor `'true'` habilita la ejecución en producción.
 *        Sin `overrideEnv`, el seed queda BLOQUEADO en producción sin excepción.
 */
function bloquearSiProd(nombre, { overrideEnv } = {}) {
  if (!config.isProd) return;

  if (overrideEnv && process.env[overrideEnv] === 'true') return;

  const comoHabilitar = overrideEnv
    ? `Crea usuarios y datos FICTICIOS. Si de verdad querés correrlo, exportá ${overrideEnv}=true.`
    : 'Este comando puede borrar datos de usuarios reales y no puede correr en producción.';

  console.error(`\n❌ "${nombre}" abortado: NODE_ENV=production.\n   ${comoHabilitar}\n`);
  process.exit(1);
}

/**
 * Los seeds de demo presuponen el esquema al día y NUNCA corren migraciones
 * por su cuenta. Verifica la más reciente que necesitan (020: acciones de
 * auditoría de responsable de oferta) y falla con un mensaje claro si falta,
 * antes de tocar ningún dato.
 *
 * @param {import('sequelize').Sequelize} sequelize
 */
async function exigirMigracionesAlDia(sequelize) {
  const [filas] = await sequelize.query(
    `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'enum_activity_logs_accion' AND e.enumlabel = 'reasignar_responsable_oferta'
     LIMIT 1`
  );
  if (filas.length === 0) {
    throw new Error('La base no tiene las migraciones al día (falta la 020). Corré `npm run db:migrate` antes de sembrar.');
  }
}

module.exports = { bloquearSiProd, exigirMigracionesAlDia };
