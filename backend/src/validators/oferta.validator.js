'use strict';

/**
 * oferta.validator.js — contenido de una oferta (POST /api/ofertas y
 * PUT /api/ofertas/:id). Lo usa el controller directamente (no el middleware):
 * el resultado es la WHITELIST de lo que se persiste — antes se hacía
 * `Oferta.create({ ...req.body })` y un cliente podía fijar `vistas`,
 * `estado` o `nivelExperiencia` por la API.
 *
 * A propósito siguen siendo texto libre:
 *   - remuneracion: lo que ve el alumno ("A convenir", "$500.000", "Según convenio");
 *   - ciudad: hasta el bloque de autocompletado de ubicaciones;
 *   - area: sin catálogo cerrado todavía.
 * `salario` es el monto interno (no se publica): entero >= 0.
 */

const { validarCampos } = require('./common.validator');
const CARRERAS_VALIDAS = require('../data/catalogos.json').carreras;

const MODALIDADES = ['presencial', 'remoto', 'hibrido'];
const MODALIDADES_EXTENDIDAS = ['tiempo_completo', 'medio_tiempo', 'pasantia', 'freelance'];
const TIPOS_PUESTO = ['pasante', 'trainee', 'junior'];
const VACANTES_MAX = 999;
const SALARIO_MAX = 2147483647; // columna INTEGER

const REGLAS_OFERTA = {
  titulo:                { tipo: 'texto', label: 'El título', requerido: true, max: 200 },
  descripcion:           { tipo: 'texto', label: 'La descripción', requerido: true, max: 5000 },
  requisitos:            { tipo: 'texto', label: 'Los requisitos', max: 3000 },
  area:                  { tipo: 'texto', label: 'El área', max: 150 },
  modalidad:             { tipo: 'enum', label: 'La modalidad', valores: MODALIDADES },
  modalidadExtendida:    { tipo: 'enum', label: 'El tipo de jornada', valores: MODALIDADES_EXTENDIDAS },
  ciudad:                { tipo: 'texto', label: 'La ciudad', max: 100 },
  remuneracion:          { tipo: 'texto', label: 'La remuneración', max: 100 },
  salario:               { tipo: 'entero', label: 'El salario estimado', min: 0, max: SALARIO_MAX },
  beneficios:            { tipo: 'texto', label: 'Los beneficios', max: 2000 },
  cantidadVacantes:      { tipo: 'entero', label: 'Cantidad de vacantes', min: 1, max: VACANTES_MAX },
  habilidadesRequeridas: { tipo: 'lista', label: 'Habilidades requeridas', maxItems: 30, maxItem: 60 },
  tipoPuesto:            { tipo: 'enum', label: 'El tipo de puesto', valores: TIPOS_PUESTO },
  requiereExperiencia:   { tipo: 'booleano', label: 'Requiere experiencia' },
  experienciaDetalle:    { tipo: 'texto', label: 'El detalle de experiencia', max: 1000 },
  carrerasDestinatarias: { tipo: 'lista', label: 'Carreras destinatarias', maxItems: CARRERAS_VALIDAS.length, valores: CARRERAS_VALIDAS },
  fechaPublicacion:      { tipo: 'fecha', label: 'La fecha de publicación' },
  fechaLimite:           { tipo: 'fecha', label: 'La fecha límite' },
};

/** Hoy (UTC) a las 00:00, con un día de margen por husos horarios. */
function ayerUtc() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1));
}

/**
 * Valida el contenido de una oferta.
 *
 * @param {object} body
 * @param {{ parcial?: boolean, actual?: object }} [opts]
 *   - parcial: edición (no exige requeridos ausentes; un requerido presente y
 *     vacío sigue siendo error);
 *   - actual: la oferta guardada, para comparar fechas cuando se edita solo una.
 * @returns {{ error: string|null, datos: object }} datos = solo campos permitidos
 */
function validarOferta(body, { parcial = false, actual = null } = {}) {
  const { error, datos } = validarCampos(body, REGLAS_OFERTA, { parcial });
  if (error) return { error, datos };

  // Valores por defecto del alta (columnas con default en el modelo).
  if (!parcial && datos.cantidadVacantes == null) datos.cantidadVacantes = 1;
  if (datos.cantidadVacantes === null) return { error: 'Cantidad de vacantes debe ser un número entero entre 1 y 999.', datos };

  const publicacion = datos.fechaPublicacion !== undefined ? datos.fechaPublicacion : (actual?.fechaPublicacion ?? null);
  const limite = datos.fechaLimite !== undefined ? datos.fechaLimite : (actual?.fechaLimite ?? null);
  if (publicacion && limite && new Date(limite) < new Date(publicacion)) {
    return { error: 'La fecha límite no puede ser anterior a la fecha de publicación.', datos };
  }
  // Alta: no se publica una oferta que ya venció. En la edición no se exige
  // (una oferta vieja tiene que poder corregirse sin tocar sus fechas).
  if (!parcial && datos.fechaLimite && datos.fechaLimite < ayerUtc()) {
    return { error: 'La fecha límite no puede estar en el pasado.', datos };
  }

  return { error: null, datos };
}

module.exports = {
  validarOferta,
  MODALIDADES,
  MODALIDADES_EXTENDIDAS,
  TIPOS_PUESTO,
};
