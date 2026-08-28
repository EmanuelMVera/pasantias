'use strict';

/**
 * db-backup.js — DB-01.
 *
 * Backup lógico de la base con `pg_dump -Fc` (formato custom, comprimido) a
 * `backend/backups/<DB>_<ISO8601>.dump`, y verificación con `pg_restore --list`
 * (un dump que no se puede listar está corrupto).
 *
 * En producción (Postgres administrado) el respaldo PRIMARIO son los snapshots +
 * PITR del proveedor. Este dump es el que se usa para el restore-test previo a
 * correr migraciones y como copia portable fuera del servidor de la app.
 *
 * Requiere `pg_dump` / `pg_restore` en PATH (igual que db:schema:dump).
 * Uso: npm run db:backup
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const logger = require('../src/utils/logger');

const BACKUP_DIR = path.join(__dirname, '../backups');

function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const db = process.env.DB_NAME;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destino = path.join(BACKUP_DIR, `${db}_${stamp}.dump`);

  const env = { ...process.env, PGPASSWORD: process.env.DB_PASSWORD };
  const conn = [
    '-h', process.env.DB_HOST,
    '-p', String(process.env.DB_PORT || 5432),
    '-U', process.env.DB_USER,
    '-d', db,
  ];

  execFileSync('pg_dump', [...conn, '-Fc', '-Z', '6', '-f', destino], { env, stdio: 'inherit' });

  // Verificación: si pg_restore --list falla, el dump no sirve.
  const listado = execFileSync('pg_restore', ['--list', destino], { encoding: 'utf8' });
  const objetos = listado.split('\n').filter((l) => l && !l.startsWith(';')).length;
  const bytes = fs.statSync(destino).size;

  logger.info(
    { archivo: path.relative(process.cwd(), destino), bytes, objetos },
    `backup OK (${(bytes / 1024 / 1024).toFixed(1)} MB, ${objetos} objetos)`,
  );
  logger.warn('recordá el restore-test antes de migrar: pg_restore -d <db>_restore_test ' + path.basename(destino));
}

try {
  main();
  process.exit(0);
} catch (err) {
  logger.fatal({ err }, 'db-backup.js falló (¿pg_dump en PATH?)');
  process.exit(1);
}
