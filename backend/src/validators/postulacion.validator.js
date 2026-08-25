'use strict';

// EST-08 Fase 3: se consolidaron los pares legacy/alias
// (entrevista_programada→entrevista, no_seleccionado→rechazado).
const ESTADOS_VALIDOS = [
  'en_revision', 'preseleccionado', 'entrevista', 'contratado', 'rechazado',
];

/**
 * Valida el body de PATCH /api/postulaciones/:id/estado.
 * @returns {string|null}
 */
function validateUpdateEstado(body) {
  const { estado } = body;
  if (!estado) return null; // estado es opcional (puede solo actualizar notasEmpresa)
  if (!ESTADOS_VALIDOS.includes(estado)) {
    return `Estado inválido. Valores permitidos: ${ESTADOS_VALIDOS.join(', ')}.`;
  }
  return null;
}

module.exports = { validateUpdateEstado };
