'use strict';

/**
 * perfil.service.js — reglas del perfil del alumno/egresado.
 *
 * Datos INSTITUCIONALES (los administra el instituto: importación CSV o
 * admin del sistema; el alumno solo los ve): nombre, apellido, email, rol,
 * legajo, carrera, año de egreso.
 * Datos PERSONALES / PROFESIONALES (los administra el alumno): el resto.
 */

/**
 * ¿Tiene el alumno un CV realmente disponible? La fuente de verdad es el
 * Archivo registrado (`cvArchivoId`, SEC-01), no el string legacy `cvPath`:
 * un cvPath sin Archivo no se puede descargar, así que no cuenta como CV
 * (ni para postularse, ni para el %, ni para "CV cargado"). Los perfiles
 * viejos con solo cvPath se vinculan con `npm run db:backfill:archivos`.
 */
function tieneCv(perfil) {
  return Boolean(perfil?.cvArchivoId);
}

/**
 * Campos que cuentan para el % de completitud: SOLO los que el alumno puede
 * completar. Los institucionales (carrera, año de egreso, legajo, nombre,
 * email, rol) no lo penalizan: si faltan, se informan aparte
 * (datosInstitucionalesFaltantes). El frontend replica esta lista en
 * PerfilPage.jsx para mostrar "Te falta".
 */
const CAMPOS_COMPLETITUD = [
  ['descripcion',        (p) => !!p.descripcion],
  ['habilidades',        (p) => p.habilidades?.length > 0],
  ['idiomas',            (p) => p.idiomas?.length > 0],
  ['linkedin',           (p) => !!p.linkedin],
  ['github',             (p) => !!p.github],
  ['cv',                 (p) => tieneCv(p)],
  ['areaInteres',        (p) => !!p.areaInteres],
  ['disponibilidad',     (p) => !!p.disponibilidad],
  ['fotoPerfil',         (p) => !!p.fotoPerfil],
  ['portfolio',          (p) => !!p.portfolio],
  ['experienciaLaboral', (p) => !!p.experienciaLaboral],
  ['certificaciones',    (p) => p.certificaciones?.length > 0],
  ['telefono',           (_p, u) => !!u?.telefono],
  ['ubicacion',          (_p, u) => !!u?.ubicacion],
];

/** Porcentaje de completitud del perfil (0–100) sobre CAMPOS_COMPLETITUD. */
function calcularCompletitud(perfil, usuario) {
  if (!perfil) return 0;
  const completados = CAMPOS_COMPLETITUD.filter(([, ok]) => ok(perfil, usuario)).length;
  return Math.round((completados / CAMPOS_COMPLETITUD.length) * 100);
}

/**
 * Datos académicos que el INSTITUTO debería haber registrado y faltan. No son
 * pendientes del alumno (no los puede editar): la UI muestra un aviso para
 * que contacte a la institución.
 * @returns {string[]} etiquetas legibles ('carrera', 'año de egreso', 'legajo')
 */
function datosInstitucionalesFaltantes(perfil, usuario) {
  const faltan = [];
  if (!perfil?.carrera) faltan.push('carrera');
  if (usuario?.rol === 'egresado' && !perfil?.anioEgreso) faltan.push('año de egreso');
  if (!perfil?.legajo) faltan.push('legajo');
  return faltan;
}

module.exports = {
  tieneCv, calcularCompletitud, datosInstitucionalesFaltantes, CAMPOS_COMPLETITUD,
};
