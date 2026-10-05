'use strict';

const { validarCampos } = require('./common.validator');
const { CARRERAS } = require('../services/catalogo.service');

const RECLUTADORES_MAX = 10;

// Límites = columnas de solicitud_empresas (solicitudEmpresa.model.js).
const REGLAS_SOLICITUD = {
  razonSocial:         { tipo: 'texto', label: 'La razón social', requerido: true, max: 200 },
  cuit:                { tipo: 'cuit', label: 'El CUIT', requerido: true },
  rubro:               { tipo: 'texto', label: 'El rubro', requerido: true, max: 150 },
  sitioWeb:            { tipo: 'url', label: 'El sitio web' },
  direccion:           { tipo: 'texto', label: 'La dirección', max: 255 },
  ciudad:              { tipo: 'texto', label: 'La ciudad', max: 100 },
  email:               { tipo: 'email', label: 'El email de contacto institucional', requerido: true },
  telefono:            { tipo: 'telefono', label: 'El teléfono institucional' },
  responsableNombre:   { tipo: 'texto', label: 'El nombre del responsable', requerido: true, max: 150 },
  responsableApellido: { tipo: 'texto', label: 'El apellido del responsable', requerido: true, max: 150 },
  responsableEmail:    { tipo: 'email', label: 'El email del responsable', requerido: true },
  responsableTelefono: { tipo: 'telefono', label: 'El teléfono del responsable' },
  responsableCargo:    { tipo: 'texto', label: 'El cargo del responsable', max: 100 },
  // Mismo catálogo institucional que las ofertas (catalogo.service).
  carrerasInteres:     { tipo: 'lista', label: 'Carreras de interés', maxItems: CARRERAS.length, valores: CARRERAS },
  descripcion:         { tipo: 'texto', label: 'La descripción', max: 2000 },
  puestos:             { tipo: 'texto', label: 'Los puestos de interés', max: 2000 },
};

const REGLAS_RECLUTADOR = {
  nombre:   { tipo: 'texto', label: 'El nombre', requerido: true, max: 100 },
  apellido: { tipo: 'texto', label: 'El apellido', requerido: true, max: 100 },
  email:    { tipo: 'email', label: 'El email', requerido: true },
};

/**
 * Valida el body de POST /api/solicitudes-empresa (público). Devuelve los
 * valores normalizados: CUIT solo dígitos, emails en minúsculas, textos con
 * trim, vacíos como null. Reclutadores: se descartan las filas totalmente
 * vacías; una fila con algún dato exige nombre, apellido y email válidos.
 *
 * @returns {{ error: string|null, datos?: object }}
 */
function validateCrearSolicitud(body) {
  // carrerasInteres puede llegar como JSON string (multipart) además de array.
  const entrada = { ...body };
  if (typeof entrada.carrerasInteres === 'string' && entrada.carrerasInteres.trim().startsWith('[')) {
    try { entrada.carrerasInteres = JSON.parse(entrada.carrerasInteres); } catch { /* lo rechaza validarCampos */ }
  }

  const { error, datos } = validarCampos(entrada, REGLAS_SOLICITUD);
  if (error) return { error };

  if (entrada.reclutadores !== undefined && entrada.reclutadores !== null && !Array.isArray(entrada.reclutadores)) {
    return { error: 'Los reclutadores iniciales deben ser una lista.' };
  }
  const filas = (entrada.reclutadores ?? []).filter((r) => {
    if (!r || typeof r !== 'object') return true; // basura → que la rechace la validación
    return ['nombre', 'apellido', 'email'].some((k) => typeof r[k] === 'string' ? r[k].trim() : r[k] != null);
  });
  if (filas.length > RECLUTADORES_MAX) return { error: `Podés indicar hasta ${RECLUTADORES_MAX} reclutadores iniciales.` };

  const reclutadores = [];
  for (let i = 0; i < filas.length; i++) {
    const r = filas[i];
    if (!r || typeof r !== 'object') return { error: `El reclutador #${i + 1} no es válido.` };
    const res = validarCampos(r, REGLAS_RECLUTADOR);
    if (res.error) {
      return { error: `Reclutador #${i + 1}: ${res.error}` };
    }
    reclutadores.push(res.datos);
  }

  return { error: null, datos: { ...datos, reclutadores } };
}

module.exports = { validateCrearSolicitud };
