/**
 * tests/helpers/cleanup.js — TEST-01.
 *
 * `usuarios` es paranoid (soft delete, EST-08): hay que forzar el borrado
 * real o el próximo run choca contra el UNIQUE de email/cuit con filas
 * "borradas" que en realidad siguen ahí (mismo bug ya visto en seedDemo.js).
 *
 * Las cascadas ya definidas en models/index.js (Usuario → Perfil / Empresa /
 * EmpresaUsuario / Postulacion / Notificacion / Mensaje; Empresa → Oferta /
 * EmpresaUsuario; Oferta → Postulacion) hacen que borrar los `Usuario.id`
 * de punta (alumno, dueño de empresa, reclutador, admin) alcance para
 * limpiar todo lo demás que un test haya generado a partir de ellos.
 *
 * `SolicitudEmpresa` es standalone (sin FK a Usuario) — se limpia aparte.
 */

'use strict';
const fs = require('fs');
const { Usuario, SolicitudEmpresa, sequelize } = require('../../src/models');

async function limpiarUsuarios(...ids) {
  const idsValidos = ids.flat().filter(Boolean);
  if (idsValidos.length === 0) return;
  await Usuario.destroy({ where: { id: idsValidos }, force: true });
}

async function limpiarSolicitudesEmpresa(...ids) {
  const idsValidos = ids.flat().filter(Boolean);
  if (idsValidos.length === 0) return;
  await SolicitudEmpresa.destroy({ where: { id: idsValidos } });
}

// Borra el archivo físico escrito por crearArchivoCV (helper de test, no un
// Archivo real de la app) — Usuario.destroy ya borra la fila por cascada,
// pero no toca el disco.
function limpiarArchivoFisico(rutaAbsoluta) {
  if (!rutaAbsoluta) return;
  fs.rm(rutaAbsoluta, { force: true }, () => {});
}

async function cerrarConexion() {
  await sequelize.close();
}

module.exports = { limpiarUsuarios, limpiarSolicitudesEmpresa, limpiarArchivoFisico, cerrarConexion };
