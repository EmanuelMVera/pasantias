'use strict';

/**
 * migrate.js — DB-01.
 *
 * Runner de migraciones (Umzug v3) para desarrollo y producción.
 * - Usa la MISMA instancia `sequelize` de la app y el logger (pino).
 * - Reusa la tabla `SequelizeMeta` (las migraciones ya aplicadas quedan reconocidas).
 * - Los archivos migrations/NNN-*.js NO se tocan: un `resolve` adapta el formato
 *   `module.exports = { up(queryInterface, Sequelize), down(queryInterface) }`.
 * - `pg_advisory_lock`: si el deploy corre esto en N instancias, solo una migra.
 * - Transacción por migración: opt-in con `module.exports.useTransaction = true`
 *   (las históricas no lo declaran → corren igual que con Sequelize CLI).
 *
 * Uso:
 *   node scripts/migrate.js up
 *   node scripts/migrate.js down [--to <name> | --step <n>]
 *   node scripts/migrate.js status
 *   node scripts/migrate.js pending
 *   node scripts/migrate.js create <nombre-del-cambio>
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Umzug, SequelizeStorage } = require('umzug');
const { Sequelize } = require('sequelize');
const { config } = require('../src/config/env');
const sequelize = require('../src/config/database');
const logger = require('../src/utils/logger');

// DEPLOY-01: fallar claro si no hay a dónde conectarse (Render corre esto en el
// build; sin DATABASE_URL/DB_* el error de Sequelize sería mucho menos legible).
if (!config.db.url && !config.db.name) {
  logger.fatal('Falta configuración de base de datos: definí DATABASE_URL, o DB_HOST + DB_NAME + DB_USER + DB_PASSWORD.');
  process.exit(1);
}

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');
const TEMPLATE = path.join(__dirname, '_migration-template.js');
const LOCK_KEY = 40712026; // pg_advisory_lock('pasantias:migrations')

function makeUmzug() {
  const qi = sequelize.getQueryInterface();
  return new Umzug({
    migrations: {
      glob: ['*.js', { cwd: MIGRATIONS_DIR }],
      resolve: ({ name, path: filepath }) => {
        const m = require(filepath);
        const run = (fn) => (m.useTransaction
          ? sequelize.transaction((t) => fn(qi, Sequelize, t))
          : fn(qi, Sequelize));
        return {
          name,
          up: () => run(m.up),
          down: () => run(m.down),
        };
      },
    },
    storage: new SequelizeStorage({ sequelize }), // tabla SequelizeMeta
    logger: {
      info: (m) => logger.info({ umzug: m }, 'migracion'),
      warn: (m) => logger.warn({ umzug: m }, 'migracion'),
      error: (m) => logger.error({ umzug: m }, 'migracion'),
      debug: (m) => logger.debug({ umzug: m }, 'migracion'),
    },
  });
}

async function withLock(fn) {
  await sequelize.query('SELECT pg_advisory_lock($1)', { bind: [LOCK_KEY] });
  try {
    return await fn();
  } finally {
    await sequelize.query('SELECT pg_advisory_unlock($1)', { bind: [LOCK_KEY] });
  }
}

async function cmdStatus(umzug) {
  const [ejecutadas, pendientes] = await Promise.all([umzug.executed(), umzug.pending()]);
  logger.info(
    { ejecutadas: ejecutadas.map((m) => m.name), pendientes: pendientes.map((m) => m.name) },
    `migraciones: ${ejecutadas.length} aplicadas, ${pendientes.length} pendientes`,
  );
}

function cmdCreate(nombre) {
  if (!nombre || !/^[a-z0-9-]+$/.test(nombre)) {
    throw new Error('Uso: node scripts/migrate.js create <nombre-en-kebab-case>');
  }
  const existentes = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}-.*\.js$/.test(f));
  const maxN = existentes.reduce((max, f) => Math.max(max, parseInt(f.slice(0, 3), 10)), -1);
  const nnn = String(maxN + 1).padStart(3, '0');
  const destino = path.join(MIGRATIONS_DIR, `${nnn}-${nombre}.js`);
  const contenido = fs.readFileSync(TEMPLATE, 'utf8').replace(/__NOMBRE__/g, nombre);
  fs.writeFileSync(destino, contenido);
  logger.info({ archivo: path.relative(process.cwd(), destino) }, 'migración creada');
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const umzug = makeUmzug();

  switch (cmd) {
    case 'up':
      await withLock(() => umzug.up());
      break;
    case 'down': {
      const toIdx = args.indexOf('--to');
      const stepIdx = args.indexOf('--step');
      const opts = toIdx >= 0 ? { to: args[toIdx + 1] }
        : stepIdx >= 0 ? { step: Number(args[stepIdx + 1]) }
        : undefined;
      await withLock(() => umzug.down(opts));
      break;
    }
    case 'status':
      await cmdStatus(umzug);
      break;
    case 'pending': {
      const p = await umzug.pending();
      logger.info({ pendientes: p.map((m) => m.name) }, `${p.length} pendientes`);
      break;
    }
    case 'create':
      cmdCreate(args[0]);
      break;
    default:
      throw new Error('Comandos: up | down [--to <name>|--step <n>] | status | pending | create <nombre>');
  }
}

main()
  .then(() => sequelize.close())
  .then(() => process.exit(0))
  .catch(async (err) => {
    logger.fatal({ err }, 'migrate.js falló');
    try { await sequelize.close(); } catch { /* nada */ }
    process.exit(1);
  });
