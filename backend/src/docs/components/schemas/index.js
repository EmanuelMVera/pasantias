'use strict';

// Junta todos los schemas en un solo objeto. Explota si dos archivos definen
// el mismo nombre.
const parts = [
  require('./_wrappers'),
  require('./usuario'),
  require('./perfil'),
  require('./empresa'),
  require('./oferta'),
  require('./postulacion'),
  require('./solicitud'),
  require('./varios'),
  require('./admin'),
  require('./misc'),
];

const schemas = {};
for (const part of parts) {
  for (const [name, schema] of Object.entries(part)) {
    if (schemas[name]) throw new Error(`schema duplicado: ${name}`);
    schemas[name] = schema;
  }
}

module.exports = schemas;
