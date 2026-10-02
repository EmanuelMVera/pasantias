/**
 * seedShowcase.js — deja el ambiente de demo completo: corre
 * seedPresentacion.js + seedInstitucional.js en secuencia.
 *
 *   - Presentación: la historia dirigida de Delta Innovación IT (las 3 cuentas
 *     públicas de LoginPage + su equipo y candidatos).
 *   - Institucional: volumen para paneles, filtros, estadísticas y exportación.
 *
 * No duplica lógica de siembra: solo llama a las funciones públicas de los dos
 * módulos. Cada seed es independiente, idempotente y transaccional por su
 * cuenta (no comparten transacción), así que volver a correrlo tras un fallo
 * parcial es seguro.
 *
 * Requiere las migraciones al día (`npm run db:migrate`): no las corre.
 *
 * Uso:
 *   npm run db:seed:showcase          (siembra / resiembra ambos datasets)
 *   npm run db:seed:showcase:status   (verifica — solo lectura, showcaseStatus.js)
 *   npm run db:showcase:reset         (limpia todo lo ficticio y vuelve a sembrar, showcaseReset.js)
 *
 * Exporta: ejecutarShowcase({ verbose }) — lo reusa showcaseReset.js.
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { config } = require('../config/env');
const { bloquearSiProd } = require('./seedGuards');
const { sequelize } = require('../models');
const { ejecutarSeedPresentacion, EMP_ADMIN, RECLUTA, ALUMNO } = require('./seedPresentacion');
const { ejecutarSeedInstitucional } = require('./seedInstitucional');

/** Siembra los dos datasets (cada uno limpia antes su propio namespace). */
async function ejecutarShowcase({ verbose = false } = {}) {
  if (verbose) console.log('── 1/2: escenario dirigido (Delta Innovación IT) ─────────────────');
  const presentacion = await ejecutarSeedPresentacion({ verbose });

  if (verbose) console.log('\n── 2/2: dataset institucional (volumen) ──────────────────────────');
  const institucional = await ejecutarSeedInstitucional({ verbose });

  return { presentacion, institucional };
}

/** Resumen final (sin secretos en producción). Lo comparte showcaseReset.js. */
function imprimirResumen({ presentacion: pres, institucional: inst }) {
  console.log('  Cuentas de LoginPage (las únicas 3 con login público):');
  console.log(`    ${EMP_ADMIN.email} / ${RECLUTA.email} / ${ALUMNO.email}`);
  console.log(`    (password: ${config.isProd ? '(ver docs/DEPLOYMENT.md)' : pres.password})`);
  console.log(`  Empresa de la demo dirigida: ${pres.empresa} — ${pres.reclutadores} reclutadores, ` +
    `${pres.ofertas} ofertas, ${pres.postulaciones} postulaciones`);
  console.log(`  Dataset institucional: ${inst.empresas} empresas (${inst.confiables} de confianza), ` +
    `${inst.reclutadores} reclutadores, ${inst.alumnos} alumnos/egresados, ${inst.ofertas} ofertas ` +
    `(${inst.ofertasAutoAprobadas} de publicación automática), ${inst.postulaciones} postulaciones`);
  console.log('  (el dataset institucional NO tiene login público — password aleatoria, nunca impresa)');
}

module.exports = { ejecutarShowcase, imprimirResumen };

// ── CLI: node src/utils/seedShowcase.js ─────────────────────────────────────

if (require.main === module) {
  // Mismo flag que gobierna ambos seeds individualmente.
  bloquearSiProd('db:seed:showcase', { overrideEnv: 'ALLOW_PRODUCTION_DEMO_SEED' });

  (async () => {
    try {
      await sequelize.authenticate();
      console.log(`✅ Conectado a "${config.db.name || 'DATABASE_URL'}".`);
      console.log('⚠️  Corre seedPresentacion + seedInstitucional. Datos 100% ficticios, no borra usuarios reales.\n');

      const r = await ejecutarShowcase({ verbose: true });

      console.log('\n✨ Showcase completo ✨\n');
      imprimirResumen(r);
      console.log('  Verificar: npm run db:seed:showcase:status\n');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error ejecutando seedShowcase:', err.message || err);
      process.exit(1);
    }
  })();
}
