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
const NOTA_INTERNA_MAX = 2000; // mismo límite que postulacion.service.js

function validateUpdateEstado(body) {
  const { estado, notasEmpresa } = body;

  // Nota interna (opcional): texto de hasta 2000 caracteres, o null/'' para borrarla.
  if (notasEmpresa !== undefined && notasEmpresa !== null) {
    if (typeof notasEmpresa !== 'string') return 'La nota interna debe ser texto.';
    if (notasEmpresa.trim().length > NOTA_INTERNA_MAX) {
      return `La nota interna no puede superar los ${NOTA_INTERNA_MAX} caracteres.`;
    }
  }

  if (!estado) {
    // estado es opcional (se puede guardar solo la nota), pero algo tiene que venir.
    return notasEmpresa === undefined ? 'Indicá el nuevo estado o la nota interna.' : null;
  }
  if (!ESTADOS_VALIDOS.includes(estado)) {
    return `Estado inválido. Valores permitidos: ${ESTADOS_VALIDOS.join(', ')}.`;
  }
  return null;
}

module.exports = { validateUpdateEstado };
