'use strict';

const { Empresa, Oferta, Usuario } = require('../models');
const empresaService = require('../services/empresa.service');
const { whereOfertaVisible } = require('../services/oferta.service');
const equipoService  = require('../services/empresaEquipo.service');
const { parsePagination } = require('../utils/pagination');
const { procesarSubidaImagen, establecerUrlExterna } = require('../services/archivoImagen.service');
const { registrarAuditoria } = require('../utils/auditLog');
const { crearNotificacion } = require('../utils/notificador');
const logger = require('../utils/logger');

// SEC-03: `logo` NO se edita por texto libre — se sube por
// POST /api/empresas/mi-empresa/logo (multipart, validado).
const CAMPOS_EDITABLES_EMPRESA = [
  'descripcion', 'rubro', 'sitioWeb', 'telefono', 'direccion', 'ciudad',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const _resolverEmpresa = empresaService.resolverEmpresaDelRequest;

/**
 * Alcance obligatorio del actor sobre ofertas y candidatos:
 *   - admin_empresa → toda la empresa (null);
 *   - reclutador    → solo las ofertas a su cargo (su id de usuario).
 * Se aplica en el servidor antes que cualquier filtro del query.
 */
const responsableIdDe = (req) => (req.miembroEmpresa?.rolInterno === 'reclutador' ? req.usuario.id : null);

// ── Dashboard ─────────────────────────────────────────────────────────────────

exports.getDashboard = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

  const datosEmpresa = { id: empresa.id, razonSocial: empresa.razonSocial, estadoAprobacion: empresa.estadoAprobacion };
  const rolEnEquipo = req.miembroEmpresa?.rolInterno || null;

  // Reclutador: panel PERSONAL (solo sus ofertas y candidatos). Las métricas
  // corporativas son del administrador de empresa.
  const responsableId = responsableIdDe(req);
  if (responsableId) {
    const panel = await empresaService.obtenerPanelReclutador(empresa.id, responsableId);
    return res.json({
      success: true,
      data: { empresa: datosEmpresa, rolEnEquipo, alcance: 'reclutador', ...panel },
    });
  }

  const metricas = await empresaService.obtenerMetricasDashboard(empresa.id);

  return res.json({
    success: true,
    data: { empresa: datosEmpresa, rolEnEquipo, alcance: 'empresa', ...metricas },
  });
};

// ── Ofertas propias ───────────────────────────────────────────────────────────

exports.getMisOfertas = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  // Filtros server-side (antes de paginar): estado, moderación, responsable y texto.
  const { data, pagination } = await empresaService.obtenerOfertasConConteo(empresa.id, {
    estado: req.query.estado,
    estadoModeracion: req.query.estadoModeracion,
    responsable: req.query.responsable,
    q: req.query.q,
    responsableId: responsableIdDe(req),
    page, limit, offset,
  });
  return res.json({ success: true, data, pagination, total: pagination.total });
};

// Detalle completo de una oferta de la empresa (para editarla o consultarla),
// en cualquier estado. Reclutador: solo si está a su cargo.
exports.getOfertaDeEmpresa = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

  const oferta = await empresaService.obtenerOfertaDeEmpresa(empresa.id, req.params.id, responsableIdDe(req));
  if (!oferta) return res.status(404).json({ success: false, message: 'Oferta no encontrada.' });
  return res.json({ success: true, data: oferta });
};

// ── Responsable de una oferta (gobierno: solo admin_empresa) ──────────────────
// Asigna un reclutador a una oferta sin responsable, o lo cambia. No edita el
// contenido de la oferta ni toca las postulaciones.

exports.asignarResponsableOferta = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

  const { oferta, responsable, anterior, anteriorVigente } = await empresaService.asignarResponsableOferta(
    empresa, req.params.id, req.body?.responsableId,
  );
  const esReasignacion = Boolean(anterior);

  // Avisos: al nuevo responsable siempre; al anterior solo si sigue siendo un
  // reclutador activo. Nunca al admin_empresa que acaba de hacer la acción
  // (auditoría ≠ notificación). No bloquean la respuesta.
  const avisos = [crearNotificacion({
    usuarioId: responsable.id,
    titulo: 'Se te asignó una oferta',
    mensaje: `Ahora sos responsable de "${oferta.titulo}".`,
    tipo: 'oferta',
    enlace: `/empresa/postulantes/${oferta.id}`,
    accionURL: `/empresa/postulantes/${oferta.id}`,
  })];
  if (anteriorVigente && anteriorVigente.id !== req.usuario.id) {
    avisos.push(crearNotificacion({
      usuarioId: anteriorVigente.id,
      titulo: 'Dejaste de ser responsable de una oferta',
      mensaje: `"${oferta.titulo}" ahora está a cargo de ${responsable.nombre} ${responsable.apellido}.`,
      tipo: 'oferta',
      enlace: '/empresa',
      accionURL: '/empresa',
    }));
  }
  Promise.all(avisos).catch((err) => (req.log || logger).error({ err }, 'notificacion_responsable_oferta_fallo'));

  await registrarAuditoria({
    req,
    accion: esReasignacion ? 'reasignar_responsable_oferta' : 'asignar_responsable_oferta',
    entidad: 'oferta',
    entidadId: oferta.id,
    detalle: {
      empresaId: empresa.id,
      responsableAnteriorId: anterior?.id ?? null,
      responsableNuevoId: responsable.id,
    },
  });

  return res.json({
    success: true,
    message: esReasignacion ? 'Responsable de la oferta actualizado.' : 'Responsable asignado a la oferta.',
    data: {
      id: oferta.id,
      titulo: oferta.titulo,
      creadaPorUsuarioId: oferta.creadaPorUsuarioId,
      creadaPor: responsable,
      responsableAnterior: anterior ? anterior.toJSON() : null,
    },
  });
};

// ── Ficha de un reclutador ────────────────────────────────────────────────────
// 404 único para "no existe / no es reclutador activo / no tenés relación con
// él": no permite enumerar reclutadores por id.

exports.getPerfilReclutador = async (req, res) => {
  const perfil = await empresaService.obtenerPerfilReclutador(req.usuario, req.params.id);
  if (!perfil) return res.status(404).json({ success: false, message: 'Perfil no disponible.' });
  return res.json({ success: true, data: perfil });
};

// ── Mi perfil del reclutador ──────────────────────────────────────────────────
// Datos personales del propio reclutador (los reclutadores no tienen un Perfil
// académico: todo vive en Usuario). Misma forma que la ficha pública.

const miFicha = (req) => empresaService.obtenerPerfilReclutador(req.usuario, req.usuario.id);

exports.getMiPerfilReclutador = async (req, res) => {
  const perfil = await miFicha(req);
  if (!perfil) return res.status(404).json({ success: false, message: 'Perfil no disponible.' });
  return res.json({ success: true, data: perfil });
};

// PATCH: el validador ya garantizó la whitelist (nombre, apellido, telefono,
// ubicacion). Los opcionales vacíos se guardan como null.
exports.updateMiPerfilReclutador = async (req, res) => {
  const cambios = {};
  for (const campo of ['nombre', 'apellido', 'telefono', 'ubicacion']) {
    if (req.body[campo] === undefined) continue;
    const valor = typeof req.body[campo] === 'string' ? req.body[campo].trim() : null;
    cambios[campo] = valor || null;
  }
  await Usuario.update(cambios, { where: { id: req.usuario.id } });
  return res.json({ success: true, message: 'Perfil actualizado.', data: await miFicha(req) });
};

// POST foto: misma validación segura que el resto de las imágenes (multer 2 MB
// + JPG/PNG/WEBP + magic bytes + almacenamiento público). Borra la anterior si
// era propia.
exports.uploadFotoMiPerfilReclutador = async (req, res) => {
  const usuario = await Usuario.findByPk(req.usuario.id, { attributes: ['id', 'fotoPerfil'] });
  const { urlPublica, archivoId } = await procesarSubidaImagen({
    req, tipo: 'foto_perfil', valorAnterior: usuario?.fotoPerfil,
  });
  await Usuario.update({ fotoPerfil: urlPublica }, { where: { id: req.usuario.id } });
  return res.json({ success: true, message: 'Foto de perfil actualizada.', fotoPerfil: urlPublica, archivoId });
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

// SEC-03: subida del logo (imagen pública, validada, nombre server-side).
// Acepta también una URL https externa en vez de un archivo (multer no toca
// req.body cuando el Content-Type no es multipart — ver archivoImagen.service.js).
exports.uploadLogo = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

  let urlPublica;
  let archivoId = null;
  if (req.body?.urlExterna !== undefined) {
    ({ urlPublica } = await establecerUrlExterna({ urlExterna: req.body.urlExterna, valorAnterior: empresa.logo }));
  } else {
    ({ urlPublica, archivoId } = await procesarSubidaImagen({
      req, tipo: 'logo_empresa', valorAnterior: empresa.logo,
    }));
  }
  await empresa.update({ logo: urlPublica });

  return res.json({ success: true, message: 'Logo actualizado.', logo: urlPublica, archivoId });
};

// ── Candidatos ────────────────────────────────────────────────────────────────

exports.getAllCandidatos = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const { data, pagination, conteoPorEstado } = await empresaService.obtenerCandidatosConFoto(empresa.id, {
    estado: req.query.estado,
    responsable: req.query.responsable,
    ofertaId: req.query.ofertaId,
    q: req.query.q,
    responsableId: responsableIdDe(req),
    page, limit, offset,
  });
  return res.json({ success: true, data, pagination, conteoPorEstado, total: pagination.total });
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
  registrarAuditoria({
    req,
    accion: 'solicitar_recuperacion_miembro',
    entidad: 'usuario',
    entidadId: usuarioId,
    detalle: { miembroId: req.params.id, empresaId: empresa.id, emailDestino: email },
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

  const solicitud = await equipoService.solicitarReclutador(empresa, req.body, {
    actorUsuarioId: req.usuario.id, ip: req.ip, requestId: req.id,
  });

  // RBAC-05: si la empresa es de confianza, solicitarReclutador ya creó la
  // cuenta en el mismo request — el mensaje refleja el resultado real
  // (solicitud.estado), no asume el flujo de aprobación manual.
  const mensaje = solicitud.estado === 'aprobado'
    ? 'Reclutador agregado automáticamente (empresa de confianza). Le enviamos las credenciales por email.'
    : 'Solicitud enviada correctamente. El administrador la revisará pronto.';

  return res.status(201).json({ success: true, message: mensaje, data: solicitud });
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
                 'direccion', 'telefono', 'sitioWeb', 'logo'],
  });
  if (!empresa) {
    return res.status(404).json({ success: false, message: 'Empresa no encontrada o no disponible.' });
  }

  // Mismo criterio de visibilidad que el listado de ofertas para alumnos:
  // activa Y con moderación resuelta (aprobada / publicación automática).
  // Antes solo miraba `estado`, y colaba ofertas pendientes o rechazadas.
  const ofertas = await Oferta.findAll({
    where: { empresaId: empresa.id, ...whereOfertaVisible() },
    attributes: ['id', 'titulo', 'area', 'modalidad', 'ciudad', 'fechaLimite', 'tipoPuesto'],
    order: [['createdAt', 'DESC']],
    limit: 10,
  });

  return res.json({ success: true, data: { ...empresa.toJSON(), ofertas } });
};
