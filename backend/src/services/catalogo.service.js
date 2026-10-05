'use strict';

/**
 * catalogo.service.js — catálogo institucional de carreras (fuente única).
 *
 * La lista vive en backend/src/data/catalogos.json (`carreras`), versionada
 * con el código: no hay tabla `carreras` porque nada la edita en runtime.
 * La consumen:
 *   - GET /api/catalogos/carreras (público: lo usa el formulario de solicitud
 *     de empresa, además de Crear/Editar oferta);
 *   - la validación de ofertas (carrerasDestinatarias), de la solicitud de
 *     empresa (carrerasInteres) y de la importación CSV (columna carrera).
 * Sumar una carrera = editar catalogos.json (nunca se crean por un typo).
 */

const { carreras } = require('../data/catalogos.json');

const CARRERAS = Object.freeze([...carreras]);

function esCarreraValida(carrera) {
  return typeof carrera === 'string' && CARRERAS.includes(carrera);
}

module.exports = { CARRERAS, esCarreraValida };
