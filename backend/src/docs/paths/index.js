'use strict';

// Junta los fragmentos de paths por grupo. Explota si dos archivos definen la
// misma combinación método + path.
const files = [
  'auth', 'usuarios', 'alumno', 'empresas', 'ofertas', 'postulaciones',
  'solicitudes', 'chat', 'notificaciones', 'admin', 'archivos', 'demo',
];

const paths = {};
for (const f of files) {
  const fragment = require(`./${f}`);
  for (const [path, methods] of Object.entries(fragment)) {
    paths[path] = paths[path] || {};
    for (const [method, op] of Object.entries(methods)) {
      if (paths[path][method]) {
        throw new Error(`operación duplicada: ${method.toUpperCase()} ${path}`);
      }
      paths[path][method] = op;
    }
  }
}

module.exports = paths;
