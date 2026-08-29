/**
 * index.js — Ensambla la spec OpenAPI 3.1 completa (DOC-02).
 *
 * `require('./docs')` devuelve el objeto ya armado; `buildSpec()` lo reconstruye
 * (para tests que quieren una copia fresca).
 */
'use strict';

const base = require('./openapi.base');
const components = require('./components');
const paths = require('./paths');

function buildSpec() {
  return { ...base, components, paths };
}

module.exports = buildSpec();
// no-enumerable: no aparece en JSON.stringify ni en Object.entries de la spec
Object.defineProperty(module.exports, 'buildSpec', { value: buildSpec });
