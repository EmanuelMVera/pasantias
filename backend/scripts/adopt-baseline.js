'use strict';

/**
 * adopt-baseline.js — DB-01.
 *
 * OPERACIÓN ÚNICA Y SUPERVISADA. Sirve para adoptar el sistema de migraciones
 * en una base que YA existe y cuyo esquema fue creado ANTES de las migraciones
 * formales (una vieja de `sequelize.sync({alter:true})`, o una prod anterior a
 * este runner). Marca migraciones como aplicadas SIN ejecutarlas.
 *
 * NO borra ni convierte nada (ni ENUMs, ni `avales`). Si una base vieja tuviera
 * columnas ENUM legacy que el esquema actual ya no usa, esa reconciliación es
 * una migración aparte, escrita y aprobada en su momento.
 *
 * Uso:
 *   node scripts/adopt-baseline.js --assume-at 011   # inserta 000..011 en SequelizeMeta
 *   node scripts/adopt-baseline.js --assume-at 000    # solo el baseline; el resto con db:migrate
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sequelize = require('../src/config/database');
const logger = require('../src/utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

// Objetos que produce 000-baseline (+ migraciones posteriores) — si faltan, la
// base NO está en el estado que se asume y hay que revisar a mano.
const CENTINELAS = [
  `SELECT to_regclass('public.usuarios') IS NOT NULL AS ok`,
  `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='usuarios' AND column_name='tokenVersion') AS ok`,
  `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='postulaciones' AND column_name='cvArchivoId') AS ok`,
];

async function main() {
  const idx = process.argv.indexOf('--assume-at');
  const at = idx >= 0 ? String(process.argv[idx + 1]).padStart(3, '0') : null;
  if (!at || !/^\d{3}$/.test(at)) {
    throw new Error('Uso: node scripts/adopt-baseline.js --assume-at <NNN>  (ej. 011)');
  }

  const qi = sequelize.getQueryInterface();

  // 1. SequelizeMeta no debe tener filas (si las tiene, ya está adoptada).
  await qi.createTable('SequelizeMeta', {
    name: { type: sequelize.constructor.DataTypes.STRING, primaryKey: true, allowNull: false },
  }).catch(() => {});
  const [filas] = await sequelize.query('SELECT count(*)::int AS n FROM "SequelizeMeta"');
  if (filas[0].n > 0) {
    throw new Error(`SequelizeMeta ya tiene ${filas[0].n} filas — esta base ya está bajo migraciones. Abortado.`);
  }

  // 2. Centinelas
  for (const sql of CENTINELAS) {
    const [r] = await sequelize.query(sql);
    if (!r[0].ok) {
      throw new Error(`Centinela falló: "${sql}". El esquema no coincide con lo asumido. Revisar a mano.`);
    }
  }

  // 3. Insertar 000..<at> en SequelizeMeta (sin ejecutarlas)
  const aMarcar = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}-.*\.js$/.test(f) && f.slice(0, 3) <= at)
    .sort();

  await sequelize.getQueryInterface().bulkInsert('SequelizeMeta', aMarcar.map((name) => ({ name })));

  logger.info({ marcadas: aMarcar }, `adopt-baseline: ${aMarcar.length} migraciones marcadas como aplicadas`);
  logger.info('siguiente paso: node scripts/migrate.js status  (y luego db:migrate para las pendientes)');
}

main()
  .then(() => sequelize.close())
  .then(() => process.exit(0))
  .catch(async (err) => {
    logger.fatal({ err }, 'adopt-baseline.js falló');
    try { await sequelize.close(); } catch { /* nada */ }
    process.exit(1);
  });
