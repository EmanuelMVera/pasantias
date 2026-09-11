'use strict';

/**
 * archivo.service.js — Autorización de acceso a archivos privados (SEC-01).
 *
 * Reglas de acceso a un `Archivo` privado (cv | carta_recomendacion), en orden,
 * la primera que matchea gana:
 *   1. Propietario del documento.
 *   2. Admin del sistema.
 *   3. Empresa legitimada: existe una Postulacion del dueño del archivo a una
 *      Oferta de la empresa que lo pide — misma relación que ya usan
 *      postulacion.controller.js y empresa.service.js para mostrar candidatos,
 *      no se inventa una regla nueva.
 *
 * Si ninguna regla aplica, se lanza 404 (no 403) para no confirmarle a un
 * usuario sin ningún vínculo que el id corresponde a un archivo real —
 * mismo criterio de no-filtrado que ya usa auth.controller.js::forgotPassword.
 */

const { Archivo, Postulacion, Oferta, EmpresaUsuario, Empresa } = require('../models');
const HttpError = require('../utils/httpError');
// El guard de path traversal (resolverRutaSegura) y UPLOADS_ROOT están en
// storage/paths.js — los usa storage/local.adapter.js al servir/borrar.

// Misma resolución que empresa.service.js::resolverEmpresaDelRequest, pero
// sin depender de verifyEmpresaMember (este endpoint también lo usan
// alumnos/admin, que nunca pasan por ese middleware).
async function _resolverEmpresaDelUsuario(usuarioId) {
  const membresia = await EmpresaUsuario.findOne({
    where: { usuarioId, activo: true },
    include: [{ model: Empresa, as: 'empresa' }],
  });
  if (membresia?.empresa) return membresia.empresa;
  return Empresa.findOne({ where: { usuarioId } });
}

async function _empresaTienePostulacionDe(usuarioPropietarioId, empresaId) {
  const postulacion = await Postulacion.findOne({
    where: { usuarioId: usuarioPropietarioId },
    include: [{ model: Oferta, as: 'oferta', where: { empresaId }, attributes: [] }],
  });
  return !!postulacion;
}

/**
 * Verifica autorización y devuelve el Archivo si el usuario puede verlo.
 * Lanza HttpError(404) si no corresponde ningún caso.
 */
async function autorizarYObtenerArchivo(archivoId, usuarioSolicitante) {
  const archivo = await Archivo.findByPk(archivoId);
  if (!archivo) throw new HttpError(404, 'Archivo no encontrado.');

  // 1. Propietario
  if (archivo.usuarioPropietarioId === usuarioSolicitante.id) return archivo;

  // 2. Admin del sistema
  if (usuarioSolicitante.rol === 'admin') return archivo;

  // 3. Empresa legitimada (solo aplica a documentos de candidatos)
  if (['cv', 'carta_recomendacion'].includes(archivo.tipo) && usuarioSolicitante.rol === 'empresa') {
    const empresa = await _resolverEmpresaDelUsuario(usuarioSolicitante.id);
    if (empresa) {
      const legitimada = await _empresaTienePostulacionDe(archivo.usuarioPropietarioId, empresa.id);
      if (legitimada) return archivo;
    }
  }

  throw new HttpError(404, 'Archivo no encontrado.');
}

module.exports = { autorizarYObtenerArchivo };
