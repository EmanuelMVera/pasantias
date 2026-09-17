/**
 * seedShowcase.js — corre seedPresentacion.js + seedInstitucional.js en
 * secuencia, de forma segura (mismo guard de producción que ambos, chequeado
 * una sola vez acá). Pensado para dejar el ambiente de demo/staging
 * completamente listo con un solo comando: las 3 cuentas dirigidas para
 * mostrar en LoginPage + el dataset institucional a escala para ejercitar
 * paneles, filtros, estadísticas y exportación.
 *
 * Cada seed sigue siendo independiente y autocontenido — este script no
 * comparte transacción entre los dos (cada uno ya es transaccional por su
 * cuenta) y ambos son idempotentes, así que correrlo de nuevo tras un
 * fallo parcial es seguro.
 *
 * Uso:
 *   npm run db:seed:showcase
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { config } = require('../config/env');
const { bloquearSiProd } = require('./seedGuards');
const { sequelize } = require('../models');
const { ejecutarSeedPresentacion, EMP_ADMIN, RECLUTA, ALUMNO } = require('./seedPresentacion');
const { ejecutarSeedInstitucional } = require('./seedInstitucional');

if (require.main === module) {
  // Mismo flag que gobierna ambos seeds individualmente — un solo guard acá
  // alcanza porque cada uno igual lo vuelve a chequear si se corre suelto.
  bloquearSiProd('db:seed:showcase', { overrideEnv: 'ALLOW_PRODUCTION_DEMO_SEED' });

  (async () => {
    try {
      await sequelize.authenticate();
      console.log(`✅ Conectado a "${config.db.name || 'DATABASE_URL'}".`);
      console.log('⚠️  Corre seedPresentacion + seedInstitucional. Datos 100% ficticios, no borra usuarios reales.\n');

      console.log('── 1/2: escenario dirigido (3 cuentas públicas) ──────────────────');
      const pres = await ejecutarSeedPresentacion({ verbose: true });

      console.log('\n── 2/2: dataset institucional (volumen) ──────────────────────────');
      const inst = await ejecutarSeedInstitucional({ verbose: true });

      console.log('\n✨ Showcase completo ✨\n');
      console.log('  Cuentas de LoginPage (las únicas 3 con login público):');
      console.log(`    ${EMP_ADMIN.email} / ${RECLUTA.email} / ${ALUMNO.email}`);
      console.log(`    (password: ${config.isProd ? '(ver docs/DEPLOYMENT.md)' : pres.password})`);
      console.log(`  Empresa de la demo dirigida: ${pres.empresa} — ${pres.ofertas} ofertas, ${pres.postulaciones} postulaciones`);
      console.log(`  Dataset institucional: ${inst.empresas} empresas, ${inst.reclutadores} reclutadores, ` +
        `${inst.alumnos} alumnos/egresados, ${inst.ofertas} ofertas, ${inst.postulaciones} postulaciones`);
      console.log('  (el dataset institucional NO tiene login público — password aleatoria, nunca impresa)\n');

      process.exit(0);
    } catch (err) {
      console.error('❌ Error ejecutando seedShowcase:', err);
      process.exit(1);
    }
  })();
}
