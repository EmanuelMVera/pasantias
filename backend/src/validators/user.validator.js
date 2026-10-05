'use strict';

const { validarCampos } = require('./common.validator');

const CAMPOS_PERFIL_VALIDOS = [
  'carrera', 'anioEgreso', 'descripcion', 'habilidades', 'idiomas',
  'certificaciones', 'linkedin', 'github', 'portfolio', 'redesSociales',
  'fotoPerfil', 'areaInteres', 'disponibilidad', 'preferenciasLaborales',
  'salarioPretendido', 'visibilidadPerfil', 'experienciaLaboral', 'proyectos',
  'telefono', 'ubicacion',
];

const DISPONIBILIDADES = ['inmediata', '1_mes', '3_meses', 'no_disponible'];
const ANIO_EGRESO_MIN = 1970;

/**
 * Reglas del perfil del alumno/egresado. Los límites siguen las columnas del
 * modelo (perfil.model.js / usuario.model.js); los TEXT tienen un tope
 * razonable para que nadie suba un libro por la API.
 *
 * A propósito siguen siendo texto libre: salarioPretendido (lo que el alumno
 * quiera expresar, "a convenir" incluido), ubicacion (hasta el autocompletado
 * de ubicaciones) y areaInteres (no hay catálogo cerrado todavía).
 */
function reglasPerfil() {
  return {
    carrera:               { tipo: 'texto', label: 'La carrera', max: 150 },
    // Dinámico: alumnos que todavía no egresaron pueden indicar el año previsto.
    anioEgreso:            { tipo: 'entero', label: 'El año de egreso', min: ANIO_EGRESO_MIN, max: new Date().getFullYear() + 6 },
    descripcion:           { tipo: 'texto', label: 'La descripción', max: 2000 },
    areaInteres:           { tipo: 'texto', label: 'El área de interés', max: 150 },
    linkedin:              { tipo: 'url', label: 'LinkedIn' },
    github:                { tipo: 'url', label: 'GitHub' },
    portfolio:             { tipo: 'url', label: 'El portfolio' },
    redesSociales:         { tipo: 'texto', label: 'Otras redes', max: 500 },
    habilidades:           { tipo: 'lista', label: 'Habilidades', maxItems: 30, maxItem: 60 },
    idiomas:               { tipo: 'lista', label: 'Idiomas', maxItems: 15, maxItem: 60 },
    // Certificaciones: una por línea en el formulario, array en la API.
    certificaciones:       { tipo: 'lista', label: 'Certificaciones', maxItems: 30, maxItem: 150, separador: '\n' },
    disponibilidad:        { tipo: 'enum', label: 'La disponibilidad', valores: DISPONIBILIDADES },
    preferenciasLaborales: { tipo: 'texto', label: 'Las preferencias laborales', max: 1000 },
    salarioPretendido:     { tipo: 'texto', label: 'El salario pretendido', max: 100 },
    experienciaLaboral:    { tipo: 'texto', label: 'La experiencia laboral', max: 3000 },
    proyectos:             { tipo: 'texto', label: 'Los proyectos', max: 3000 },
    telefono:              { tipo: 'telefono', label: 'El teléfono' },
    ubicacion:             { tipo: 'texto', label: 'La ubicación', max: 150 },
    // Booleano en la BD; el formulario manda 'publica' / 'privada'.
    visibilidadPerfil:     { tipo: 'booleano', label: 'La visibilidad del perfil', equivalencias: { publica: true, privada: false } },
  };
}

/**
 * Valida el body de PUT /api/users/perfil. Valida cada campo reconocido y
 * devuelve los valores normalizados (el middleware los aplica al body). Los
 * campos no reconocidos se ignoran (el frontend reenvía el perfil completo:
 * id, timestamps…); el controller aplica su propia whitelist.
 *
 * `redesSociales` puede llegar como { texto } (lo que devuelve el GET).
 * `fotoPerfil` se ignora: la foto va por su endpoint de subida (SEC-03).
 *
 * @returns {{ error: string|null, datos?: object }}
 */
function validateUpdatePerfil(body) {
  const camposRecibidos = Object.keys(body).filter((k) => CAMPOS_PERFIL_VALIDOS.includes(k));
  if (camposRecibidos.length === 0) return { error: 'No se enviaron campos válidos para actualizar.' };

  const entrada = { ...body };
  if (entrada.redesSociales && typeof entrada.redesSociales === 'object' && !Array.isArray(entrada.redesSociales)) {
    entrada.redesSociales = entrada.redesSociales.texto ?? '';
  }

  return validarCampos(entrada, reglasPerfil(), { parcial: true });
}

module.exports = { validateUpdatePerfil, DISPONIBILIDADES };
