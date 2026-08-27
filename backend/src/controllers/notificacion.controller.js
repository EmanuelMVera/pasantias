const { Notificacion } = require('../models');

const getNotificaciones = async (req, res) => {
  const notificaciones = await Notificacion.findAll({
    where: { usuarioId: req.usuario.id },
    order: [
      ['leida', 'ASC'],
      ['createdAt', 'DESC'],
    ],
    limit: 50,
  });
  const sinLeer = notificaciones.filter((n) => !n.leida).length;
  return res.json({ success: true, sinLeer, total: notificaciones.length, data: notificaciones });
};

// Endpoint de badge/polling: una falla acá nunca debe mostrarse como error al
// usuario — se degrada intencionalmente a un conteo de 0 (REF-ERR-01: se
// mantiene igual, no es un caso de "error no manejado").
const getSinLeerCount = async (req, res) => {
  try {
    const count = await Notificacion.count({
      where: { usuarioId: req.usuario.id, leida: false },
    });
    return res.json({ success: true, count });
  } catch {
    return res.json({ success: true, count: 0 });
  }
};

const leerTodas = async (req, res) => {
  await Notificacion.update(
    { leida: true },
    { where: { usuarioId: req.usuario.id, leida: false } }
  );
  return res.json({ success: true, message: 'Todas las notificaciones marcadas como leídas.' });
};

const leerUna = async (req, res) => {
  await Notificacion.update(
    { leida: true },
    { where: { id: req.params.id, usuarioId: req.usuario.id } }
  );
  return res.json({ success: true, message: 'Notificación marcada como leída.' });
};

const eliminarNotificacion = async (req, res) => {
  await Notificacion.destroy({
    where: { id: req.params.id, usuarioId: req.usuario.id },
  });
  return res.json({ success: true, message: 'Notificación eliminada.' });
};

module.exports = {
  getNotificaciones,
  getSinLeerCount,
  leerTodas,
  leerUna,
  eliminarNotificacion,
};
