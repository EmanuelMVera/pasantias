'use strict';

const { Empresa, Oferta, ActivityLog } = require('../models');
const empresaService = require('../services/empresa.service');
const equipoService  = require('../services/empresaEquipo.service');

const CAMPOS_EDITABLES_EMPRESA = [
  'descripcion', 'rubro', 'sitioWeb', 'telefono', 'direccion', 'ciudad', 'logo',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const _resolverEmpresa = empresaService.resolverEmpresaDelRequest;

// Auditoría best-effort: nunca debe interrumpir el flujo principal si falla.
async function logAction(datos) {
  try { await ActivityLog.create(datos); } catch (e) { console.warn('[ActivityLog]', e.message); }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

exports.getDashboard = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

  const metricas = await empresaService.obtenerMetricasDashboard(empresa.id);

  return res.json({
    success: true,
    data: {
      empresa: { id: empresa.id, razonSocial: empresa.razonSocial, estadoAprobacion: empresa.estadoAprobacion },
      rolEnEquipo: req.miembroEmpresa?.rolInterno || null,
      ...metricas,
    },
  });
};

// ── Ofertas propias ───────────────────────────────────────────────────────────

exports.getMisOfertas = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

  const data = await empresaService.obtenerOfertasConConteo(empresa.id);
  return res.json({ success: true, total: data.length, data });
};

// ── Perfil de empresa ─────────────────────────────────────────────────────────

exports.getMiEmpresa = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });
  // rolEnEquipo: mismo campo informativo que ya devuelven getDashboard/getEquipo
  // (FE-05) — solo UX, no reemplaza a authorizeEmpresaRoles como autoridad de permisos.
  return res.json({ success: true, data: empresa, rolEnEquipo: req.miembroEmpresa?.rolInterno || null });
};

exports.updateMiEmpresa = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

  // QA-01: validateUpdateEmpresa (middleware de la ruta) ya garantizó que
  // llegó al menos un campo reconocido y que sitioWeb, si vino, es una URL
  // válida — no se repite ese chequeo acá.
  const updateData = {};
  for (const campo of CAMPOS_EDITABLES_EMPRESA) {
    if (req.body[campo] !== undefined) updateData[campo] = req.body[campo];
  }

  await empresa.update(updateData);
  return res.json({ success: true, data: empresa });
};

// ── Candidatos ────────────────────────────────────────────────────────────────

exports.getAllCandidatos = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

  const data = await empresaService.obtenerCandidatosConFoto(empresa.id, req.query.estado);
  return res.json({ success: true, total: data.length, data });
};

// ── Equipo ────────────────────────────────────────────────────────────────────

exports.getEquipo = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

  const data = await equipoService.listarEquipo(empresa);
  const rolEnEquipo = req.miembroEmpresa?.rolInterno ?? 'admin_empresa';
  return res.json({ success: true, total: data.length, rolEnEquipo, data });
};

// EST-10: el admin_empresa nunca elige ni conoce la contraseña de un
// miembro — solo dispara el envío de un email de recuperación; el propio
// reclutador establece su contraseña vía /reset-password/:token (público).
exports.enviarRecuperacionMiembro = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

  const { email, usuarioId } = await equipoService.solicitarRecuperacionAcceso(empresa, req.params.id);

  // Auditoría: nunca se registra password ni token, solo a quién se le envió.
  logAction({
    usuarioId: req.usuario.id,
    accion: 'solicitar_recuperacion_miembro',
    entidad: 'usuario',
    entidadId: usuarioId,
    detalle: { miembroId: req.params.id, empresaId: empresa.id, emailDestino: email },
    ip: req.ip,
  });

  return res.json({ success: true, message: `Le enviamos un email a ${email} para que establezca su contraseña.` });
};

exports.updateMiembro = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

  const miembro = await equipoService.actualizarMiembro(empresa, req.params.id, req.body);
  return res.json({ success: true, message: 'Miembro actualizado.', data: miembro });
};

exports.removeMiembro = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

  await equipoService.desactivarMiembro(empresa, req.params.id);
  return res.json({ success: true, message: 'Miembro eliminado del equipo.' });
};

exports.solicitarReclutador = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

  const solicitud = await equipoService.solicitarReclutador(empresa, req.body);
  return res.status(201).json({
    success: true,
    message: 'Solicitud enviada correctamente. El administrador la revisará pronto.',
    data: solicitud,
  });
};

exports.getMisSolicitudesReclutador = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

  const solicitudes = await equipoService.obtenerSolicitudesReclutador(empresa.id);
  return res.json({ success: true, total: solicitudes.length, data: solicitudes });
};

// ── Perfil público de empresa ─────────────────────────────────────────────────

exports.getEmpresaPublica = async (req, res) => {
  const empresa = await Empresa.findOne({
    where: { id: req.params.id, estadoAprobacion: 'aprobada' },
    attributes: ['id', 'razonSocial', 'rubro', 'descripcion', 'ciudad',
                 'direccion', 'telefono', 'sitioWeb', 'logo', 'usuarioId'],
  });
  if (!empresa) {
    return res.status(404).json({ success: false, message: 'Empresa no encontrada o no disponible.' });
  }

  const ofertas = await Oferta.findAll({
    where: { empresaId: empresa.id, estado: 'activa' },
    attributes: ['id', 'titulo', 'area', 'modalidad', 'ciudad', 'fechaLimite', 'tipoPuesto'],
    order: [['createdAt', 'DESC']],
    limit: 10,
  });

  return res.json({ success: true, data: { ...empresa.toJSON(), ofertas } });
};
