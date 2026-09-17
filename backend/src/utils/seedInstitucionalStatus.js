/**
 * seedInstitucionalStatus.js — diagnóstico de SOLO LECTURA del dataset
 * institucional (Fase 1.5). No crea, no modifica, no borra nada. No imprime
 * ningún secreto.
 *
 * Uso:
 *   npm run db:seed:institucional:status
 *
 * Sin Shell en Render: correr temporalmente como Build Command
 *   npm ci && npm run db:migrate && npm run db:seed:institucional:status
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Op } = require('sequelize');
const {
  sequelize, Usuario, Empresa, EmpresaUsuario, Oferta, Postulacion,
  PostulacionHistorialEstado, Mensaje, Notificacion, ActivityLog, Archivo,
} = require('../models');
const { DOMINIO } = require('./seedInstitucional');

async function obtenerConteos() {
  const usuarios = await Usuario.findAll({
    where: { email: { [Op.iLike]: `%@${DOMINIO}` } },
    attributes: ['id', 'rol'],
    paranoid: false,
  });
  const userIds = usuarios.map((u) => u.id);

  if (userIds.length === 0) return { cargado: false };

  const empresas = await Empresa.findAll({ where: { cuit: { [Op.like]: '307000000%' } }, attributes: ['id'] });
  const empresaIds = empresas.map((e) => e.id);

  const empresaUsuarios = empresaIds.length
    ? await EmpresaUsuario.findAll({ where: { empresaId: { [Op.in]: empresaIds } }, attributes: ['rolInterno'] })
    : [];
  const admins = empresaUsuarios.filter((eu) => eu.rolInterno === 'admin_empresa').length;
  const reclutadores = empresaUsuarios.filter((eu) => eu.rolInterno === 'reclutador').length;
  const alumnos = usuarios.filter((u) => u.rol === 'alumno' || u.rol === 'egresado').length;

  const ofertas = empresaIds.length
    ? await Oferta.findAll({ where: { empresaId: { [Op.in]: empresaIds } }, attributes: ['id'] })
    : [];
  const ofertaIds = ofertas.map((o) => o.id);

  const postulaciones = ofertaIds.length
    ? await Postulacion.findAll({ where: { ofertaId: { [Op.in]: ofertaIds } }, attributes: ['id'] })
    : [];
  const postulacionIds = postulaciones.map((p) => p.id);

  const [
    historial, mensajes, notificaciones, activityLogs, archivos, adminsIndebidos,
  ] = await Promise.all([
    postulacionIds.length
      ? PostulacionHistorialEstado.count({ where: { postulacionId: { [Op.in]: postulacionIds } } })
      : 0,
    Mensaje.count({ where: { [Op.or]: [{ emisorId: { [Op.in]: userIds } }, { receptorId: { [Op.in]: userIds } }] } }),
    Notificacion.count({ where: { usuarioId: { [Op.in]: userIds } } }),
    ActivityLog.count({ where: { usuarioId: { [Op.in]: userIds } } }),
    Archivo.count({ where: { usuarioPropietarioId: { [Op.in]: userIds } } }),
    Usuario.count({ where: { rol: 'admin', email: { [Op.iLike]: `%@${DOMINIO}` } } }),
  ]);

  return {
    cargado: true,
    empresas: empresaIds.length,
    adminEmpresa: admins,
    reclutadores,
    alumnosYEgresados: alumnos,
    ofertas: ofertaIds.length,
    postulaciones: postulacionIds.length,
    postulacionHistorialEstados: historial,
    mensajes,
    notificaciones,
    activityLogs,
    archivos,
    adminsIndebidos, // debe ser SIEMPRE 0 — nunca un rol admin en este namespace
  };
}

module.exports = { obtenerConteos };

if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      const r = await obtenerConteos();

      if (!r.cargado) {
        console.log('ℹ️  El dataset institucional NO está cargado.');
        console.log('   Correr: npm run db:seed:institucional');
      } else {
        console.log('📊 Dataset institucional — conteos reales (solo lectura, sin secretos)\n');
        console.log(`  empresas:                       ${r.empresas}`);
        console.log(`  admin_empresa:                  ${r.adminEmpresa}`);
        console.log(`  reclutadores:                   ${r.reclutadores}`);
        console.log(`  alumnos/egresados:              ${r.alumnosYEgresados}`);
        console.log(`  ofertas:                        ${r.ofertas}`);
        console.log(`  postulaciones:                  ${r.postulaciones}`);
        console.log(`  postulacion_historial_estados:  ${r.postulacionHistorialEstados}`);
        console.log(`  mensajes:                       ${r.mensajes}`);
        console.log(`  notificaciones:                 ${r.notificaciones}`);
        console.log(`  activity_logs:                  ${r.activityLogs}`);
        console.log(`  archivos:                       ${r.archivos}`);
        if (r.adminsIndebidos > 0) {
          console.log(`  ⚠️  ${r.adminsIndebidos} usuario(s) con rol admin en este namespace — no debería pasar nunca.`);
        }
      }

      await sequelize.close();
      process.exit(0);
    } catch (err) {
      console.error('❌ Error en seedInstitucionalStatus:', err.message);
      process.exit(1);
    }
  })();
}
