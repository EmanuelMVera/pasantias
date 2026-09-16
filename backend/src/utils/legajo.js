'use strict';

/**
 * legajo.js — regex de formato de legajo, configurable por institución.
 *
 * Extraído de adminUsuarios.service.js (donde la regex se leía inline, dos
 * veces, en crearUsuario/actualizarUsuario) para reutilizarlo también en la
 * importación masiva de alumnos/egresados (csvImportacion.service.js) sin
 * duplicar la consulta a `configuracion_institucional`. Sin cambio de
 * comportamiento respecto al código anterior.
 */

const { ConfiguracionInstitucional } = require('../models');

const DEFAULT_REGEX = '^[A-Z0-9-]{3,20}$';

async function obtenerRegexLegajo() {
  const configRegex = await ConfiguracionInstitucional.findOne({ where: { clave: 'legajo.regex' } });
  return new RegExp(configRegex?.valor || DEFAULT_REGEX);
}

function normalizarLegajo(legajo) {
  return legajo && legajo.trim() ? legajo.trim().toUpperCase() : '';
}

module.exports = { obtenerRegexLegajo, normalizarLegajo, DEFAULT_REGEX };
