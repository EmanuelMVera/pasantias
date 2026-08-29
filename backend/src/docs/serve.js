/**
 * serve.js — Monta la doc de la API (DOC-02).
 *
 *   GET /api/openapi.json  → la spec cruda
 *   GET /api/docs          → Swagger UI (assets locales, offline)
 *
 * Gate (`ENABLE_API_DOCS`):
 *   - sin setear + NODE_ENV=production → OFF (un mapa del API interno es recon)
 *   - sin setear + no-prod            → ON
 *   - =true  → fuerza ON   ·   =false → fuerza OFF
 */
'use strict';

const swaggerUi = require('swagger-ui-express');
const spec = require('./index');

function docsEnabled() {
  const flag = process.env.ENABLE_API_DOCS;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

// El helmet global setea CSP `default-src 'none'`, que rompe el CSS/JS inline de
// Swagger UI. Acá se sobreescribe SOLO para el mount de la doc.
function docsCsp(req, res, next) {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; font-src 'self' data:; connect-src 'self'",
  );
  next();
}

function mountDocs(app) {
  if (!docsEnabled()) return false;

  app.get('/api/openapi.json', (req, res) => res.json(spec));

  app.use(
    '/api/docs',
    docsCsp,
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: 'API Pasantías — Docs',
      swaggerOptions: { persistAuthorization: true, tryItOutEnabled: true },
    }),
  );

  return true;
}

module.exports = mountDocs;
module.exports.docsEnabled = docsEnabled;
