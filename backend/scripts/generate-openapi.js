/**
 * generate-openapi.js — Vuelca la spec ensamblada a backend/openapi.json.
 *
 *   npm run docs:openapi   → escribe el archivo
 *   npm run docs:check      → escribe + `git diff --exit-code` (falla si quedó desactualizado)
 *
 * No conecta a la base: la spec es data pura y Sequelize solo se usa para leer
 * metadata de los modelos (`getAttributes()`).
 */
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const spec = require('../src/docs');

const outPath = path.join(__dirname, '..', 'openapi.json');
fs.writeFileSync(outPath, `${JSON.stringify(spec, null, 2)}\n`);

const nPaths = Object.keys(spec.paths).length;
const nOps = Object.values(spec.paths).reduce(
  (acc, methods) => acc + Object.keys(methods).length,
  0,
);
const nSchemas = Object.keys(spec.components.schemas).length;

console.log(`openapi.json escrito — ${nPaths} paths, ${nOps} operaciones, ${nSchemas} schemas.`);
