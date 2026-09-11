'use strict';

/**
 * seedGuards.js — DEPLOY-01.
 *
 * Guard común para que los seeds no corran (o no destruyan datos) en producción
 * por accidente.
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

module.exports = { bloquearSiProd };
