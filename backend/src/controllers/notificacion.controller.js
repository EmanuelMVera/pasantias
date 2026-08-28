const { Notificacion } = require('../models');
const { parsePagination, buildPagination } = require('../utils/pagination');

const getNotificaciones = async (req, res) => {
  const usuarioId = req.usuario.id;
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });

  const where = { usuarioId };
  if (req.query.leida === 'true')  where.leida = true;
  if (req.query.leida === 'false') where.leida = false;

  const [{ count, rows }, sinLeer] = await Promise.all([
    Notificacion.findAndCountAll({
      where,
      order: [['leida', 'ASC'], ['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
    }),
    Notificacion.count({ where: { usuarioId, leida: false } }),
  ]);

  const pagination = buildPagination(count, { page, limit });
  return res.json({ success: true, data: rows, pagination, sinLeer, total: pagination.total });
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
