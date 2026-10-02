/**
 * showcaseReset.js — reconstruye de cero los datos FICTICIOS del showcase.
 *
 * Pasos:
 *   1. verifica la conexión (y que las migraciones estén al día);
 *   2. limpia el escenario de presentación (actual o de una versión anterior);
 *   3. limpia el dataset institucional;
 *   4. limpia los residuos conocidos del antiguo seedDemo (ver seedLegacy.js);
 *   5. siembra presentación;
 *   6. siembra institucional;
 *   7. valida el resultado con showcaseStatus.js;
 *   8. termina (código 1 si quedó incoherente).
 *
 * QUÉ BORRA — solo namespaces ficticios explícitos, nunca por patrones amplios:
 *   - Presentación: empresa@demo.com, reclutador@demo.com, alumno@demo.com,
 *     lucia.ferrari@demo.invalid, candidatoNN@demo.invalid, la empresa "Delta
 *     Innovación IT", la solicitud de empresa demo y la cuenta legacy
 *     sistema@demo.com (rol admin, residuo de una versión vieja del seed).
 *   - Institucional: usuarios `@institucional.invalid` y empresas con CUIT
 *     `307000000NN`.
 *   - seedDemo: la lista exacta de 50 emails `.demo`, 20 alumnos
 *     `3700000N@itbeltran.com.ar` (email + nombre + apellido) y 20 razones
 *     sociales (solo si todos sus miembros son de esa lista).
 *   Y, de cada uno, lo que cuelga: ofertas, postulaciones, historial, mensajes,
 *   notificaciones, auditoría, perfiles y membresías.
 *
 * QUÉ NO BORRA NUNCA: administradores del sistema reales, alumnos importados,
 * empresas reales ni ningún usuario que no esté en esos namespaces. No hay
 * DROP, TRUNCATE ni DELETE sin `where`.
 *
 * Cada limpieza y cada siembra es transaccional por dataset (todo o nada) e
 * idempotente: correrlo dos veces deja la misma estructura y los mismos conteos.
 *
 * Seguridad: en producción exige ALLOW_PRODUCTION_DEMO_SEED=true (el mismo
 * guard que el resto de los seeds de demo). No corre migraciones: hay que
 * ejecutar `npm run db:migrate` antes.
 *
 * Uso:
 *   npm run db:showcase:reset
 *
 * Exporta: ejecutarShowcaseReset({ verbose }).
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { config } = require('../config/env');
const { bloquearSiProd, exigirMigracionesAlDia } = require('./seedGuards');
const { sequelize } = require('../models');
const { limpiarEscenarioPresentacion } = require('./seedPresentacion');
const { limpiarSoloInstitucional } = require('./seedInstitucional');
const { limpiarLegacySeedDemo } = require('./seedLegacy');
const { ejecutarShowcase, imprimirResumen } = require('./seedShowcase');
const { diagnosticarShowcase, formatearInforme } = require('./showcaseStatus');

async function limpiarLegacy() {
  const transaction = await sequelize.transaction();
  try {
    const r = await limpiarLegacySeedDemo(transaction);
    await transaction.commit();
    return r;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/**
 * Limpia todos los datos ficticios conocidos, vuelve a sembrar y valida.
 * @returns {{ legacy, presentacion, institucional, status }}
 */
async function ejecutarShowcaseReset({ verbose = false } = {}) {
  const say = (...args) => { if (verbose) console.log(...args); };

  // Antes de borrar nada: si el esquema está desactualizado, la siembra
  // fallaría después de haber limpiado.
  await exigirMigracionesAlDia(sequelize);

  say('🧹 1/3 Limpiando escenario de presentación...');
  await limpiarEscenarioPresentacion();

  say('🧹 2/3 Limpiando dataset institucional...');
  await limpiarSoloInstitucional();

  say('🧹 3/3 Limpiando residuos del antiguo seedDemo...');
  const legacy = await limpiarLegacy();
  say(legacy.usuarios || legacy.empresas
    ? `   Eliminados ${legacy.usuarios} usuarios y ${legacy.empresas} empresas legacy.`
    : '   No había residuos.');

  say('\n🌱 Sembrando showcase...');
  const { presentacion, institucional } = await ejecutarShowcase({ verbose });

  say('\n🔎 Validando...');
  const status = await diagnosticarShowcase();

  return { legacy, presentacion, institucional, status };
}

module.exports = { ejecutarShowcaseReset };

// ── CLI: node src/utils/showcaseReset.js ────────────────────────────────────

if (require.main === module) {
  bloquearSiProd('db:showcase:reset', { overrideEnv: 'ALLOW_PRODUCTION_DEMO_SEED' });

  (async () => {
    try {
      await sequelize.authenticate();
      console.log(`✅ Conectado a "${config.db.name || 'DATABASE_URL'}".`);
      console.log('⚠️  Reconstruye SOLO los datos ficticios del showcase. No borra usuarios reales.\n');

      const r = await ejecutarShowcaseReset({ verbose: true });

      console.log(`\n${formatearInforme(r.status)}\n`);
      imprimirResumen(r);
      console.log('');
      process.exit(r.status.coherente ? 0 : 1);
    } catch (err) {
      console.error('❌ Error ejecutando showcaseReset:', err.message || err);
      process.exit(1);
    }
  })();
}
