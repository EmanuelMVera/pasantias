'use strict';

/**
 * database.js — Instancia única de Sequelize (app + migraciones).
 *
 * DEPLOY-01:
 * - Precedencia de conexión: si `DATABASE_URL` está definida se usa esa (Neon/
 *   Render inyectan una sola connection string); si no, `DB_HOST/PORT/NAME/USER/
 *   PASSWORD` (desarrollo local).
 * - SSL configurable (`DB_SSL`, o `sslmode=require` en la URL, o `PGSSLMODE`).
 *   En producción va ON por defecto. `rejectUnauthorized` queda en `true`
 *   (Neon tiene certificado válido); para desactivar la verificación hay que
 *   pedirlo explícito con `DB_SSL_NO_VERIFY=true` (documentado en .env.example).
 * - Pool configurable con `DB_POOL_MAX` (default 5 — prudente para Render chico
 *   + la connection string *pooled* de Neon).
 *
 * `scripts/migrate.js` requiere este mismo módulo → las migraciones corren con
 * idéntica conexión (y SSL) que la app.
 */

const { Sequelize } = require('sequelize');
const { config } = require('./env');
const logger = require('../utils/logger');

/** Opciones de Sequelize derivadas del config. Puro (testeable). */
function buildSequelizeOptions(cfg = config) {
  const options = {
    dialect: 'postgres',
    // OPS-01: el SQL solo se logea con LOG_LEVEL=debug (evita construir el
    // string en prod). Va por el logger técnico, no a console.
    logging: cfg.logLevel === 'debug'
      ? (sql) => logger.debug({ sql }, 'sequelize')
      : false,
    pool: {
      max: cfg.db.poolMax,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  };
  if (cfg.db.ssl) {
    options.dialectOptions = {
      ssl: { require: true, rejectUnauthorized: !cfg.db.sslNoVerify },
    };
  }
  return options;
}

const sequelize = config.db.url
  ? new Sequelize(config.db.url, buildSequelizeOptions())
  : new Sequelize(config.db.name, config.db.user, config.db.password, {
      host: config.db.host,
      port: config.db.port,
      ...buildSequelizeOptions(),
    });

module.exports = sequelize;
module.exports.buildSequelizeOptions = buildSequelizeOptions;
