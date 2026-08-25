/**
 * dumpSchema.js — Genera schema.sql a partir del esquema real de la base.
 *
 * schema.sql (en la raíz del repo) es un artefacto GENERADO, no escrito a
 * mano (EST-08 §1.4): sirve como referencia de qué esquema produce
 * realmente la migración baseline + las que se vayan agregando, y como
 * input para detectar drift entre las migraciones y el esquema real.
 *
 * Requiere `pg_dump` disponible en PATH (viene con cualquier instalación
 * de PostgreSQL, carpeta `bin/`). En Windows, si no está en PATH, agregar
 * la carpeta bin de la instalación (ej. "C:\Program Files\PostgreSQL\17\bin")
 * a la variable de entorno PATH, o correr pg_dump manualmente con la ruta
 * completa usando los mismos flags que este script.
 *
 * Uso: npm run db:schema:dump
 */

'use strict';
require('dotenv').config();
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const outFile = path.resolve(__dirname, '../../../schema.sql');

const args = [
  '-h', process.env.DB_HOST,
  '-p', String(process.env.DB_PORT || 5432),
  '-U', process.env.DB_USER,
  '-d', process.env.DB_NAME,
  '--schema-only',
  '--no-owner',
  '--no-privileges',
];

execFile('pg_dump', args, { env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD }, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
  if (err) {
    console.error('❌ No se pudo generar schema.sql:', err.message);
    if (stderr) console.error(stderr);
    console.error('¿Está "pg_dump" en el PATH? Ver el comentario de este archivo.');
    process.exit(1);
  }
  fs.writeFileSync(outFile, stdout);
  console.log(`✅ schema.sql actualizado (${stdout.length} caracteres) desde la base "${process.env.DB_NAME}".`);
});
