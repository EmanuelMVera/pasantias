/**
 * seedPresentacionStatus.js — diagnóstico de SOLO LECTURA del escenario de
 * presentación (demo). No crea, no modifica, no borra nada. No imprime
 * ningún secreto (ni passwords, ni hashes, ni tokens).
 *
 * Responde exactamente lo que pide el punto 10 del pedido de iteración:
 * conteos reales por tabla del escenario demo, para verificar contra
 * PostgreSQL sin tener que confiar en un resumen anterior.
 *
 * Uso:
 *   npm run db:seed:presentacion:status
 *
 * Sin Shell en Render: correr temporalmente como Build Command
 *   npm ci && npm run db:migrate && npm run db:seed:presentacion:status
 * y revisar el log del deploy — después restaurar el Build Command normal
 * (no persiste nada, es de solo lectura, pero no hace falta dejarlo).
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Op } = require('sequelize');
const {
  sequelize, Usuario, Empresa, EmpresaUsuario, Oferta, Postulacion,
  PostulacionHistorialEstado, Mensaje, Notificacion, ActivityLog,
  SolicitudEmpresa, SolicitudReclutador, Archivo,
} = require('../models');
const { escenarioExiste, RAZON_SOCIAL, OUR_EMAILS, SOLICITUD_EMPRESA_EMAIL } = require('./seedPresentacion');

/**
 * Calcula los conteos reales del escenario demo. Todo el alcance ("qué fila
 * pertenece al escenario") sale de OUR_EMAILS/RAZON_SOCIAL de
 * seedPresentacion.js — una sola fuente de verdad, no se duplica el criterio.
 */
async function obtenerConteos() {
  if (!(await escenarioExiste())) {
    return { cargado: false };
  }

  const usuariosDemo = await Usuario.findAll({
    where: { email: { [Op.in]: OUR_EMAILS } },
    attributes: ['id', 'email'],
    paranoid: false,
  });
  const userIds = usuariosDemo.map((u) => u.id);
  const candidatosSinteticos = usuariosDemo.filter((u) => u.email.endsWith('@demo.invalid')).length;
  const usuariosLogin = usuariosDemo.length - candidatosSinteticos;

  const empresa = await Empresa.findOne({ where: { razonSocial: RAZON_SOCIAL }, attributes: ['id'] });
  const empresaIds = empresa ? [empresa.id] : [];

  const empresaUsuarios = empresaIds.length
    ? await EmpresaUsuario.count({ where: { empresaId: { [Op.in]: empresaIds } } })
    : 0;

  const ofertas = empresaIds.length
    ? await Oferta.findAll({ where: { empresaId: { [Op.in]: empresaIds } }, attributes: ['id'] })
    : [];
  const ofertaIds = ofertas.map((o) => o.id);

  const postulaciones = ofertaIds.length
    ? await Postulacion.findAll({ where: { ofertaId: { [Op.in]: ofertaIds } }, attributes: ['id'] })
    : [];
  const postulacionIds = postulaciones.map((p) => p.id);

  const [
    postulacionHistorialEstados,
    mensajes,
    notificaciones,
    activityLogs,
    solicitudesEmpresa,
    solicitudesReclutadorPendientes,
    solicitudesReclutadorTotal,
    archivos,
  ] = await Promise.all([
    postulacionIds.length
      ? PostulacionHistorialEstado.count({ where: { postulacionId: { [Op.in]: postulacionIds } } })
      : 0,
    userIds.length
      ? Mensaje.count({ where: { [Op.or]: [{ emisorId: { [Op.in]: userIds } }, { receptorId: { [Op.in]: userIds } }] } })
      : 0,
    userIds.length ? Notificacion.count({ where: { usuarioId: { [Op.in]: userIds } } }) : 0,
    userIds.length ? ActivityLog.count({ where: { usuarioId: { [Op.in]: userIds } } }) : 0,
    SolicitudEmpresa.count({ where: { responsableEmail: SOLICITUD_EMPRESA_EMAIL } }),
    empresaIds.length
      ? SolicitudReclutador.count({ where: { empresaId: { [Op.in]: empresaIds }, estado: 'pendiente' } })
      : 0,
    empresaIds.length
      ? SolicitudReclutador.count({ where: { empresaId: { [Op.in]: empresaIds } } })
      : 0,
    userIds.length ? Archivo.count({ where: { usuarioPropietarioId: { [Op.in]: userIds } } }) : 0,
  ]);

  return {
    cargado: true,
    usuariosDemoLogin: usuariosLogin,
    candidatosSinteticos,
    empresas: empresaIds.length,
    empresaUsuarios,
    ofertas: ofertaIds.length,
    postulaciones: postulaciones.length,
    postulacionHistorialEstados,
    mensajes,
    notificaciones,
    activityLogs,
    solicitudesEmpresa,
    solicitudesReclutadorPendientes,
    solicitudesReclutadorTotal,
    archivos,
  };
}

module.exports = { obtenerConteos };

// ── CLI: node src/utils/seedPresentacionStatus.js ───────────────────────────

if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      const r = await obtenerConteos();

      if (!r.cargado) {
        console.log('ℹ️  El escenario de presentación NO está cargado.');
        console.log('   Correr: npm run db:seed:presentacion');
      } else {
        console.log('📊 Escenario de presentación — conteos reales (solo lectura, sin secretos)\n');
        console.log(`  usuarios (login demo):              ${r.usuariosDemoLogin}`);
        console.log(`  usuarios (candidatos sintéticos):   ${r.candidatosSinteticos}`);
        console.log(`  empresas:                           ${r.empresas}`);
        console.log(`  empresa_usuarios:                   ${r.empresaUsuarios}`);
        console.log(`  ofertas:                             ${r.ofertas}`);
        console.log(`  postulaciones:                       ${r.postulaciones}`);
        console.log(`  postulacion_historial_estados:       ${r.postulacionHistorialEstados}`);
        console.log(`  mensajes:                            ${r.mensajes}`);
        console.log(`  notificaciones:                      ${r.notificaciones}`);
        console.log(`  activity_logs:                       ${r.activityLogs}`);
        console.log(`  solicitudes_empresa:                 ${r.solicitudesEmpresa}`);
        console.log(`  solicitudes_reclutador (pendientes): ${r.solicitudesReclutadorPendientes}`);
        console.log(`  solicitudes_reclutador (total):      ${r.solicitudesReclutadorTotal}`);
        console.log(`  archivos:                            ${r.archivos}`);
      }

      await sequelize.close();
      process.exit(0);
    } catch (err) {
      console.error('❌ Error en seedPresentacionStatus:', err.message);
      process.exit(1);
    }
  })();
}
