'use strict';

const { Postulacion, Oferta, Usuario, Perfil, Empresa, Archivo, PostulacionHistorialEstado } = require('../models');
const { crearNotificacion } = require('../utils/notificador');
const postulacionService = require('../services/postulacion.service');
const empresaService     = require('../services/empresa.service');
const { parsePagination, buildPagination, groupCount } = require('../utils/pagination');
const { registrarAuditoria } = require('../utils/auditLog');

const _resolverEmpresa = empresaService.resolverEmpresaDelRequest;

// ── Postularse ────────────────────────────────────────────────────────────────

exports.postular = async (req, res) => {
  const { ofertaId, cartaPresentacion } = req.body;
  const usuarioId = req.usuario.id;

  const oferta = await postulacionService.validarPostulacion(usuarioId, ofertaId);

  // Snapshot del CV vigente al momento de postularse (EST-08 §5.4): si el
  // alumno lo actualiza después, esta postulación sigue apuntando al que
  // existía cuando la empresa lo evaluó.
  const cvArchivo = await Archivo.findOne({
    where: { usuarioPropietarioId: usuarioId, tipo: 'cv' },
    order: [['createdAt', 'DESC']],
  });

  const postulacion = await Postulacion.create({
    usuarioId, ofertaId, cartaPresentacion,
    cvArchivoId: cvArchivo?.id || null,
  });

  await PostulacionHistorialEstado.create({
    postulacionId: postulacion.id,
    estadoAnterior: null,
    estadoNuevo: postulacion.estado,
    cambiadoPorUsuarioId: usuarioId,
  });

  await crearNotificacion({
    usuarioId: oferta.empresa.usuarioId,
    titulo: 'Nueva postulación recibida',
    mensaje: `${req.usuario.nombre} ${req.usuario.apellido} se postuló a "${oferta.titulo}".`,
    tipo: 'postulacion',
    enlace: `/empresa/postulantes/${ofertaId}`,
    accionURL: `/empresa/postulantes/${ofertaId}`,
  });

  registrarAuditoria({
    req,
    usuarioId,
    accion: 'postular',
    entidad: 'postulacion',
    entidadId: postulacion.id,
    detalle: { ofertaId, ofertaTitulo: oferta.titulo, empresa: oferta.empresa?.razonSocial },
  });

  return res.status(201).json({
    success: true,
    message: 'Postulación enviada correctamente.',
    data: postulacionService.formatearPostulacion(postulacion),
  });
};

// ── Historial de postulaciones del alumno ─────────────────────────────────────

exports.getMisPostulaciones = async (req, res) => {
  const usuarioId = req.usuario.id;
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const { estado } = req.query;

  const where = { usuarioId };
  if (estado) where.estado = estado;

  const [{ count, rows }, conteoPorEstado] = await Promise.all([
    Postulacion.findAndCountAll({
      where,
      include: [{
        model: Oferta,
        as: 'oferta',
        include: [{ model: Empresa, as: 'empresa', attributes: ['razonSocial', 'logo', 'ciudad', 'rubro'] }],
      }],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
    }),
    groupCount(Postulacion, 'estado', { usuarioId }),
  ]);

  const data = rows.map(postulacionService.formatearPostulacion);
  const pagination = buildPagination(count, { page, limit });
  return res.json({ success: true, data, pagination, conteoPorEstado, total: pagination.total });
};

// ── Candidatos de una oferta (empresa) ───────────────────────────────────────

exports.getPostulacionesByOferta = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(403).json({ success: false, message: 'No tenés un perfil de empresa activo.' });

  const oferta = await Oferta.findOne({ where: { id: req.params.ofertaId, empresaId: empresa.id } });
  if (!oferta) return res.status(404).json({ success: false, message: 'Oferta no encontrada.' });

  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const { estado } = req.query;

  const where = { ofertaId: oferta.id };
  if (estado) where.estado = estado;

  const [{ count, rows: postulaciones }, conteoPorEstado] = await Promise.all([
    Postulacion.findAndCountAll({
      where,
      include: [{
        model: Usuario,
        as: 'usuario',
        attributes: { exclude: ['password', 'tokenReset', 'tokenResetExpira'] },
        include: [{ model: Perfil, as: 'perfil' }],
      }],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
    }),
    groupCount(Postulacion, 'estado', { ofertaId: oferta.id }),
  ]);

  const data = postulaciones.map((p) => {
    const plain = p.toJSON();
    const perfil = plain.usuario?.perfil;
    return {
      ...plain,
      estadoActual:         plain.estado,
      ultimaActualizacion:  plain.updatedAt,
      observacionesEmpresa: plain.notasEmpresa,
      cvDisponible: !!perfil?.cvPath,
      cvUrl:        perfil?.cvPath || null,
      compatibilidadOferta: postulacionService.calcularCompatibilidad(perfil, oferta),
      historialAcademico: perfil ? {
        carrera:       perfil.carrera,
        anioEgreso:    perfil.anioEgreso,
        certificaciones: perfil.certificaciones || [],
        disponibilidad: perfil.disponibilidad,
        areaInteres:   perfil.areaInteres,
      } : null,
    };
  });

  const pagination = buildPagination(count, { page, limit });
  return res.json({
    success: true,
    data,
    pagination,
    conteoPorEstado,
    total: pagination.total,
    oferta: { id: oferta.id, titulo: oferta.titulo, habilidadesRequeridas: oferta.habilidadesRequeridas },
  });
};

// ── Cambiar estado de postulación (empresa) ───────────────────────────────────

exports.updateEstado = async (req, res) => {
  const { estado, notasEmpresa } = req.body;
  const postulacion = await Postulacion.findByPk(req.params.id, {
    include: [{ model: Oferta, as: 'oferta', include: [{ model: Empresa, as: 'empresa' }] }],
  });

  if (!postulacion) return res.status(404).json({ success: false, message: 'Postulación no encontrada.' });

  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(403).json({ success: false, message: 'No tenés un perfil de empresa activo.' });
  if (postulacion.oferta.empresaId !== empresa.id) {
    return res.status(403).json({ success: false, message: 'No tenés permiso para modificar esta postulación.' });
  }

  const estadoAnterior = postulacion.estado;

  const updateData = {};
  if (estado) updateData.estado = estado;
  if (notasEmpresa !== undefined) updateData.notasEmpresa = notasEmpresa;
  await postulacion.update(updateData);

  if (estado && estado !== estadoAnterior) {
    await PostulacionHistorialEstado.create({
      postulacionId: postulacion.id,
      estadoAnterior,
      estadoNuevo: estado,
      cambiadoPorUsuarioId: req.usuario.id,
      notaInterna: notasEmpresa || null,
    });
  }

  const estadoTexto = {
    preseleccionado: 'Fuiste preseleccionado/a',
    entrevista:      'Tu entrevista fue programada',
    rechazado:       'Tu postulación no fue seleccionada',
    contratado:      '¡Felicitaciones! Fuiste seleccionado/a',
  };

  if (estado) {
    await crearNotificacion({
      usuarioId: postulacion.usuarioId,
      titulo: estadoTexto[estado] || 'Estado actualizado',
      mensaje: `Tu postulación para "${postulacion.oferta.titulo}" cambió a: ${estado.replace(/_/g, ' ')}.`,
      tipo: 'estado',
      enlace: '/mis-postulaciones',
      accionURL: '/mis-postulaciones',
    });

    registrarAuditoria({
      req,
      accion: 'cambiar_estado_postulacion',
      entidad: 'postulacion',
      entidadId: postulacion.id,
      detalle: { nuevoEstado: estado, oferta: postulacion.oferta?.titulo },
    });
  }

  return res.json({ success: true, message: 'Postulación actualizada.', data: postulacionService.formatearPostulacion(postulacion) });
};
