/**
 * tests/setup/globalSetup.js — TEST-01.
 *
 * Corre UNA sola vez antes de toda la suite (Jest `globalSetup`, proceso
 * aparte, no comparte módulos con los archivos de test). Deja la base de
 * test lista sin que el desarrollador tenga que correr nada a mano:
 *
 *   1. Calcula el nombre de la base de test (mismo criterio que env.js).
 *   2. La crea si no existe (mismo patrón que resetDev.js).
 *   3. Corre TODAS las migraciones (scripts/migrate.js) contra ella.
 *
 * Nunca toca la base de desarrollo — se conecta a `postgres` (DB de
 * mantenimiento) solo para el CREATE DATABASE condicional.
 */

'use strict';
require('dotenv').config();
const { Client } = require('pg');
const { execFileSync } = require('child_process');
const path = require('path');

module.exports = async function globalSetup() {
  const dbNameTest = process.env.DB_NAME_TEST || `${process.env.DB_NAME}_test`;

  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres',
  });
  await client.connect();
  try {
    const existe = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbNameTest]);
    if (existe.rowCount === 0) {
      // No se puede parametrizar el nombre en CREATE DATABASE; dbNameTest sale
      // siempre de DB_NAME (env local) + sufijo fijo, nunca de input externo.
      await client.query(`CREATE DATABASE "${dbNameTest}"`);
      console.log(`[globalSetup] Base de test "${dbNameTest}" creada.`);
    }
  } finally {
    await client.end();
  }

  // env.js ya setea NODE_ENV=test y DB_NAME → la base de test; el runner
  // (scripts/migrate.js) usa la instancia sequelize de la app.
  execFileSync('node', ['scripts/migrate.js', 'up'], {
    cwd: path.join(__dirname, '../..'),
    env: { ...process.env, NODE_ENV: 'test', DB_NAME: dbNameTest },
    stdio: 'inherit',
  });
};
