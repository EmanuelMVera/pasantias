'use strict';

/**
 * seedLegacy.js — limpieza de residuos del antiguo `seedDemo.js` (eliminado).
 *
 * Ese seed ya no existe, pero una base donde corrió alguna vez puede conservar
 * sus datos ficticios. Este módulo los identifica por una LISTA EXACTA Y
 * CERRADA (lo que aquel script generaba de forma determinística) y los borra.
 * Nunca usa patrones amplios:
 *
 *   - Usuarios de empresa: los 50 emails exactos `nombre.apellido@<empresa>.demo`
 *     (el TLD `.demo` no existe: no puede ser una cuenta real).
 *   - Alumnos/egresados: 20 cuentas `3700000N@itbeltran.com.ar`. Ese dominio es
 *     el REAL del instituto, así que no alcanza con el email: además tienen que
 *     coincidir nombre, apellido y rol alumno/egresado. Un alumno real con otro
 *     nombre (o cualquier otro email del dominio) jamás se toca.
 *   - Empresas: las 20 razones sociales exactas, y SOLO si todos sus miembros
 *     son usuarios legacy de la lista (una empresa real que casualmente comparta
 *     razón social, con gente real adentro, se deja intacta).
 *
 * Nunca borra un usuario con rol admin. Lo usa únicamente showcaseReset.js.
 */

const { Op } = require('sequelize');
const {
  Usuario, Perfil, Empresa, EmpresaUsuario, Oferta, Postulacion,
  PostulacionHistorialEstado, Notificacion, Mensaje, ActivityLog,
  SolicitudReclutador, Archivo,
} = require('../models');

const LEGACY_RAZONES_SOCIALES = [
  'TechNova SRL', 'DataSur SA', 'CloudPampa SAS',
  'Industrias Beltrán', 'Finanzas Río de la Plata', 'Redes del Sur SRL',
  'SegurIT Consultores', 'ElectroPolo SA', 'AutoControl Ingeniería',
  'Mecánica Austral', 'AdminPro Servicios', 'Contar Group',
  'LogiTrans Metropolitana', 'MarketLab Digital', 'Diseño Delta',
  'BioTec Sistemas', 'PuntoRed Cooperativa', 'InnovaMetal SA',
  'Nexo ERP SRL', 'EcoDistribución SAS',
];

const LEGACY_EMAILS_EMPRESA = [
  'martin.ferreyra@technova.demo', 'lucia.benitez@technova.demo',
  'ignacio.rojo@technova.demo', 'claudia.ibanez@datasur.demo',
  'roberto.sanchez@datasur.demo', 'diego.torres@cloudpampa.demo',
  'florencia.arce@cloudpampa.demo', 'pablo.leiva@cloudpampa.demo',
  'hugo.castillo@industriasbeltran.demo', 'marcela.vera@industriasbeltran.demo',
  'valeria.montoya@finanzasrp.demo', 'sebastian.ojeda@finanzasrp.demo',
  'natalia.cruz@finanzasrp.demo', 'ricardo.almeida@redesdelsur.demo',
  'evangelina.paredes@redesdelsur.demo', 'andres.villalba@segurit.demo',
  'cecilia.lagos@segurit.demo', 'juan.dominguez@segurit.demo',
  'fernando.ramos@electropolo.demo', 'beatriz.herrera@electropolo.demo',
  'silvia.palma@autocontrol.demo', 'rodrigo.figueroa@autocontrol.demo',
  'sandra.mora@autocontrol.demo', 'gustavo.contreras@mecanicaaustral.demo',
  'patricia.espinoza@mecanicaaustral.demo', 'ana.leguizamon@adminpro.demo',
  'daniel.fuentes@adminpro.demo', 'lorena.aguilar@adminpro.demo',
  'jorge.noriega@contargroup.demo', 'viviana.correa@contargroup.demo',
  'liliana.delgado@logitrans.demo', 'marcos.ponce@logitrans.demo',
  'carolina.blanco@logitrans.demo', 'ignacio.salinas@marketlab.demo',
  'daniela.rios@marketlab.demo', 'florencia.vidal@disenodelta.demo',
  'tomas.bravo@disenodelta.demo', 'gabriela.soto@disenodelta.demo',
  'nicolas.rojas@biotecsistemas.demo', 'paola.gutierrez@biotecsistemas.demo',
  'teresa.acevedo@puntored.demo', 'eduardo.reyes@puntored.demo',
  'natalia.lara@puntored.demo', 'alejandro.pinto@innovametal.demo',
  'monica.vargas@innovametal.demo', 'cristina.meza@nexoerp.demo',
  'leonardo.castro@nexoerp.demo', 'paulina.vega@nexoerp.demo',
  'omar.sepulveda@ecodistribucion.demo', 'miriam.sandoval@ecodistribucion.demo',
];

// [email, nombre, apellido] — los tres tienen que coincidir.
const LEGACY_ALUMNOS = [
  ['37000000@itbeltran.com.ar', 'Lucas', 'Fernández'],
  ['37000001@itbeltran.com.ar', 'Martina', 'Sosa'],
  ['37000002@itbeltran.com.ar', 'Tomás', 'Pereyra'],
  ['37000003@itbeltran.com.ar', 'Valentina', 'Ríos'],
  ['37000004@itbeltran.com.ar', 'Franco', 'López'],
  ['37000005@itbeltran.com.ar', 'Camila', 'Acuña'],
  ['37000006@itbeltran.com.ar', 'Agustín', 'Morales'],
  ['37000007@itbeltran.com.ar', 'Sofía', 'Ruiz'],
  ['37000008@itbeltran.com.ar', 'Nicolás', 'Maidana'],
  ['37000009@itbeltran.com.ar', 'Micaela', 'Giménez'],
  ['37000010@itbeltran.com.ar', 'Leandro', 'Cáceres'],
  ['37000011@itbeltran.com.ar', 'Brenda', 'Vega'],
  ['37000012@itbeltran.com.ar', 'Ramiro', 'Silva'],
  ['37000013@itbeltran.com.ar', 'Julieta', 'Navarro'],
  ['37000014@itbeltran.com.ar', 'Facundo', 'Ortega'],
  ['37000015@itbeltran.com.ar', 'Milagros', 'Molina'],
  ['37000016@itbeltran.com.ar', 'Ezequiel', 'Bustos'],
  ['37000017@itbeltran.com.ar', 'Daiana', 'Romero'],
  ['37000018@itbeltran.com.ar', 'Gonzalo', 'Medina'],
  ['37000019@itbeltran.com.ar', 'Abril', 'Suárez'],
];

/** Usuarios y empresas que son residuo comprobado del viejo seedDemo. */
async function identificarLegacy(transaction) {
  const deEmpresa = await Usuario.findAll({
    where: { email: { [Op.in]: LEGACY_EMAILS_EMPRESA }, rol: 'empresa' },
    attributes: ['id'], paranoid: false, transaction,
  });

  const candidatos = await Usuario.findAll({
    where: { email: { [Op.in]: LEGACY_ALUMNOS.map((a) => a[0]) }, rol: { [Op.in]: ['alumno', 'egresado'] } },
    attributes: ['id', 'email', 'nombre', 'apellido'], paranoid: false, transaction,
  });
  const esperado = new Map(LEGACY_ALUMNOS.map(([email, nombre, apellido]) => [email, `${nombre}|${apellido}`]));
  const alumnos = candidatos.filter((u) => esperado.get(u.email) === `${u.nombre}|${u.apellido}`);

  const userIds = [...deEmpresa, ...alumnos].map((u) => u.id);
  const legacy = new Set(userIds);

  const empresas = await Empresa.findAll({
    where: { razonSocial: { [Op.in]: LEGACY_RAZONES_SOCIALES } },
    attributes: ['id'], paranoid: false, transaction,
  });
  const empresaIds = [];
  for (const empresa of empresas) {
    const miembros = await EmpresaUsuario.findAll({ where: { empresaId: empresa.id }, attributes: ['usuarioId'], transaction });
    if (miembros.every((m) => legacy.has(m.usuarioId))) empresaIds.push(empresa.id);
  }

  return { userIds, empresaIds };
}

/**
 * Borra los residuos del viejo seedDemo y todo lo que cuelga de ellos.
 * @returns {{ usuarios: number, empresas: number }} cantidades eliminadas
 */
async function limpiarLegacySeedDemo(transaction) {
  const { userIds, empresaIds } = await identificarLegacy(transaction);
  if (userIds.length === 0 && empresaIds.length === 0) return { usuarios: 0, empresas: 0 };

  const ofertas = empresaIds.length
    ? await Oferta.findAll({ where: { empresaId: { [Op.in]: empresaIds } }, attributes: ['id'], paranoid: false, transaction })
    : [];
  const ofertaIds = ofertas.map((o) => o.id);

  const orPost = [];
  if (userIds.length) orPost.push({ usuarioId: { [Op.in]: userIds } });
  if (ofertaIds.length) orPost.push({ ofertaId: { [Op.in]: ofertaIds } });
  if (orPost.length) {
    const posts = await Postulacion.findAll({ where: { [Op.or]: orPost }, attributes: ['id'], transaction });
    const postIds = posts.map((p) => p.id);
    if (postIds.length) {
      await PostulacionHistorialEstado.destroy({ where: { postulacionId: { [Op.in]: postIds } }, transaction });
      await Postulacion.destroy({ where: { id: { [Op.in]: postIds } }, transaction });
    }
  }

  if (userIds.length) {
    await Mensaje.destroy({
      where: { [Op.or]: [{ emisorId: { [Op.in]: userIds } }, { receptorId: { [Op.in]: userIds } }] },
      transaction,
    });
    await Notificacion.destroy({ where: { usuarioId: { [Op.in]: userIds } }, transaction });
    await ActivityLog.destroy({ where: { usuarioId: { [Op.in]: userIds } }, transaction });
    await Archivo.destroy({ where: { usuarioPropietarioId: { [Op.in]: userIds } }, transaction, force: true });
  }

  if (empresaIds.length) {
    await SolicitudReclutador.destroy({ where: { empresaId: { [Op.in]: empresaIds } }, transaction });
    await Oferta.destroy({ where: { empresaId: { [Op.in]: empresaIds } }, transaction, force: true });
    await EmpresaUsuario.destroy({ where: { empresaId: { [Op.in]: empresaIds } }, transaction });
    await Empresa.destroy({ where: { id: { [Op.in]: empresaIds } }, transaction, force: true });
  }

  if (userIds.length) {
    await Perfil.destroy({ where: { usuarioId: { [Op.in]: userIds } }, transaction });
    await EmpresaUsuario.destroy({ where: { usuarioId: { [Op.in]: userIds } }, transaction });
    await Usuario.destroy({ where: { id: { [Op.in]: userIds } }, transaction, force: true });
  }

  return { usuarios: userIds.length, empresas: empresaIds.length };
}

module.exports = {
  limpiarLegacySeedDemo,
  identificarLegacy,
  LEGACY_RAZONES_SOCIALES,
  LEGACY_EMAILS_EMPRESA,
  LEGACY_ALUMNOS,
};
