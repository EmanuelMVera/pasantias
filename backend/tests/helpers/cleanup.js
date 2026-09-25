/**
 * tests/helpers/cleanup.js — TEST-01.
 *
 * `usuarios` es paranoid (soft delete, EST-08): hay que forzar el borrado
 * real o el próximo run choca contra el UNIQUE de email/cuit con filas
 * "borradas" que en realidad siguen ahí (mismo bug ya visto en seedDemo.js).
 *
 * Las cascadas ya definidas en models/index.js (Usuario → Perfil /
 * EmpresaUsuario / Postulacion / Notificacion / Mensaje; Empresa → Oferta /
 * EmpresaUsuario; Oferta → Postulacion) hacen que borrar los `Usuario.id`
 * de punta (alumno, reclutador, admin) alcance para limpiar todo lo demás
 * que un test haya generado a partir de ellos.
 *
 * Empresa YA NO cuelga de Usuario (RBAC-06 / migración 019 eliminó
 * `Empresa.usuarioId`) — antes de borrar los usuarios hay que resolver de
 * qué empresas alguno de ellos era `admin_empresa` y borrar esas empresas
 * explícitamente, para seguir disparando la cascada Empresa →
 * Oferta/Postulacion/EmpresaUsuario que antes se disparaba sola vía
 * `Usuario.hasOne(Empresa)`.
 *
 * `SolicitudEmpresa` es standalone (sin FK a Usuario) — se limpia aparte.
 */

'use strict';
const fs = require('fs');
const { Usuario, Empresa, EmpresaUsuario, SolicitudEmpresa, sequelize } = require('../../src/models');

async function limpiarUsuarios(...ids) {
  const idsValidos = ids.flat().filter(Boolean);
  if (idsValidos.length === 0) return;

  const membresiasAdmin = await EmpresaUsuario.findAll({
    where: { usuarioId: idsValidos, rolInterno: 'admin_empresa' },
    attributes: ['empresaId'],
  });
  const empresaIds = [...new Set(membresiasAdmin.map((m) => m.empresaId))];
  if (empresaIds.length > 0) {
    await Empresa.destroy({ where: { id: empresaIds }, force: true });
  }

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
