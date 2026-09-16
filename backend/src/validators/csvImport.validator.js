'use strict';

/**
 * csvImport.validator.js — valida y normaliza UNA fila del CSV de
 * importación masiva de alumnos/egresados. No toca la base de datos (los
 * conflictos contra la DB existente los resuelve csvImportacion.service.js,
 * que sí puede hacer las queries necesarias).
 *
 * Formato esperado (9 columnas, header exacto):
 *   legajo,nombre,apellido,email,rol,carrera,anioEgreso,telefono,ubicacion
 */

const { esEmailValido } = require('./common.validator');
const { normalizarLegajo } = require('../utils/legajo');

const COLUMNAS = ['legajo', 'nombre', 'apellido', 'email', 'rol', 'carrera', 'anioEgreso', 'telefono', 'ubicacion'];
const ROLES_VALIDOS = ['alumno', 'egresado'];
const ANIO_MIN = 1990;

function validarHeader(columnas) {
  if (!Array.isArray(columnas) || columnas.length !== COLUMNAS.length) return false;
  return COLUMNAS.every((c, i) => columnas[i] === c);
}

/**
 * @param {object} filaCruda — una fila tal como la devuelve csv-parse (columns:true)
 * @param {RegExp} regexLegajo — de utils/legajo.js::obtenerRegexLegajo()
 * @returns {{ ok: boolean, fila: object, errores: string[] }}
 */
function validarFilaCsv(filaCruda, regexLegajo) {
  const errores = [];

  const legajo = normalizarLegajo(filaCruda.legajo);
  if (!legajo) errores.push('legajo es obligatorio.');
  else if (!regexLegajo.test(legajo)) errores.push('legajo no tiene un formato válido.');

  const nombre = String(filaCruda.nombre || '').trim();
  if (!nombre) errores.push('nombre es obligatorio.');

  const apellido = String(filaCruda.apellido || '').trim();
  if (!apellido) errores.push('apellido es obligatorio.');

  const email = String(filaCruda.email || '').trim().toLowerCase();
  if (!email) errores.push('email es obligatorio.');
  else if (!esEmailValido(email)) errores.push('email no tiene un formato válido.');

  const rol = String(filaCruda.rol || '').trim().toLowerCase();
  if (!ROLES_VALIDOS.includes(rol)) errores.push(`rol debe ser "alumno" o "egresado" (recibido: "${filaCruda.rol || ''}").`);

  const carrera = String(filaCruda.carrera || '').trim() || null;

  const anioEgresoCrudo = String(filaCruda.anioEgreso ?? '').trim();
  let anioEgreso = null;
  if (rol === 'alumno') {
    if (anioEgresoCrudo) errores.push('anioEgreso debe estar vacío para rol alumno.');
  } else if (rol === 'egresado') {
    const n = Number(anioEgresoCrudo);
    const anioActual = new Date().getFullYear();
    if (!anioEgresoCrudo || !Number.isInteger(n) || n < ANIO_MIN || n > anioActual + 1) {
      errores.push(`anioEgreso es obligatorio para rol egresado y debe estar entre ${ANIO_MIN} y ${anioActual + 1}.`);
    } else {
      anioEgreso = n;
    }
  }

  const telefono = String(filaCruda.telefono || '').trim() || null;
  const ubicacion = String(filaCruda.ubicacion || '').trim() || null;

  return {
    ok: errores.length === 0,
    fila: { legajo, nombre, apellido, email, rol, carrera, anioEgreso, telefono, ubicacion },
    errores,
  };
}

module.exports = { COLUMNAS, ROLES_VALIDOS, validarHeader, validarFilaCsv };
