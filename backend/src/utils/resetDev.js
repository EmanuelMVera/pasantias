/**
 * resetDev.js — Reinicia la base de datos de DESARROLLO desde cero.
 *
 * Reemplaza al viejo `cleanup_db.sql` (EST-08 §1.2): en vez de borrar filas
 * seleccionamente por email hardcodeado, dropea y recrea la base completa
 * y corre las migraciones — más rápido, determinista, y sin forma de tocar
 * accidentalmente una base que no sea la de desarrollo local.
 *
 * Guardas de seguridad (no se pueden saltear con flags):
 * - Aborta si NODE_ENV !== 'development'.
 * - Aborta si DB_HOST no es localhost/127.0.0.1.
 *
 * Uso: npm run db:reset:dev
 * Después de correr esto, sembrar datos con:
 *   npm run db:seed:admin
 *   npm run db:seed:demo
 */

'use strict';
require('dotenv').config();
const { execFile } = require('child_process');
const { Client } = require('pg');

const HOSTS_PERMITIDOS = new Set(['localhost', '127.0.0.1', '::1']);

async function main() {
  if (process.env.NODE_ENV !== 'development') {
    console.error(`❌ db:reset:dev abortado: NODE_ENV es "${process.env.NODE_ENV}", no "development". Este comando nunca debe correr fuera de desarrollo local.`);
    process.exit(1);
  }

  const host = process.env.DB_HOST || '';
  if (!HOSTS_PERMITIDOS.has(host)) {
    console.error(`❌ db:reset:dev abortado: DB_HOST="${host}" no está en la allowlist local (${[...HOSTS_PERMITIDOS].join(', ')}). Esto evita que el script toque por error una base remota/de producción.`);
    process.exit(1);
  }

  const dbName = process.env.DB_NAME;
  const adminConn = {
    host, port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: 'postgres',
  };

  console.log(`⚠️  Reiniciando la base de desarrollo "${dbName}" en ${host}...`);
  const client = new Client(adminConn);
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`✅ Base "${dbName}" recreada vacía.`);
  } finally {
    await client.end();
  }

  console.log('▶ Corriendo migraciones (node scripts/migrate.js up)...');
  await new Promise((resolve, reject) => {
    execFile('node', ['scripts/migrate.js', 'up'], { cwd: __dirname + '/../..' }, (err, stdout, stderr) => {
      process.stdout.write(stdout);
      if (err) { process.stderr.write(stderr); return reject(err); }
      resolve();
    });
  });

  console.log('✅ Listo. Ahora podés correr: npm run db:seed:admin && npm run db:seed:demo');
}

main().catch((err) => {
  console.error('❌ Error en db:reset:dev:', err.message);
  process.exit(1);
});
