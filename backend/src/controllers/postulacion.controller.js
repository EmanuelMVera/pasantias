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

  // Operación ≠ gobierno: la nueva postulación se avisa al RECLUTADOR
  // RESPONSABLE de la oferta, no al admin_empresa. Solo si la oferta no tiene
  // un responsable válido (histórica, suspendido…) cae en el admin_empresa
  // para no perder el evento. Ver empresa.service::obtenerDestinatariosPostulacion.
  const destinatarios = await empresaService.obtenerDestinatariosPostulacion(oferta);
  await Promise.all(destinatarios.map((dest) => crearNotificacion({
    usuarioId: dest.id,
    titulo: 'Nueva postulación recibida',
    mensaje: `${req.usuario.nombre} ${req.usuario.apellido} se postuló a "${oferta.titulo}".`,
    tipo: 'postulacion',
    enlace: `/empresa/postulantes/${ofertaId}`,
    accionURL: `/empresa/postulantes/${ofertaId}`,
  })));

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
    data: postulacionService.formatearPostulacionAlumno(postulacion),
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

  // Sin la nota interna de la empresa: es seguimiento privado del reclutador.
  const data = rows.map(postulacionService.formatearPostulacionAlumno);
  const pagination = buildPagination(count, { page, limit });
  return res.json({ success: true, data, pagination, conteoPorEstado, total: pagination.total });
};

// ── Candidatos de una oferta (empresa) ───────────────────────────────────────

exports.getPostulacionesByOferta = async (req, res) => {
  const empresa = await _resolverEmpresa(req);
  if (!empresa) return res.status(403).json({ success: false, message: 'No tenés un perfil de empresa activo.' });

  const oferta = await Oferta.findOne({
    where: { id: req.params.ofertaId, empresaId: empresa.id },
    // Responsable de la oferta: lo muestra la vista de supervisión del proceso.
    include: [{ model: Usuario, as: 'creadaPor', attributes: ['id', 'nombre', 'apellido'] }],
  });
  if (!oferta) return res.status(404).json({ success: false, message: 'Oferta no encontrada.' });

  // El proceso de una oferta es la mesa de trabajo de su reclutador
  // responsable. Otro reclutador de la empresa (o cualquiera, si la oferta no
  // tiene responsable asignado) no accede: la supervisión es del admin_empresa.
  const esReclutador = req.miembroEmpresa?.rolInterno === 'reclutador';
  if (esReclutador && oferta.creadaPorUsuarioId !== req.usuario.id) {
    return res.status(403).json({
      success: false,
      message: oferta.creadaPorUsuarioId
        ? 'Este proceso está a cargo de otro reclutador.'
        : 'Esta oferta todavía no tiene un responsable asignado. El administrador de la empresa tiene que asignarla.',
      code: 'NO_ES_RESPONSABLE',
    });
  }
  const puedeGestionar = esReclutador;

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
        // Solo lo necesario para trabajar el proceso (sin teléfono ni datos de cuenta).
        attributes: ['id', 'nombre', 'apellido', 'email', 'fotoPerfil', 'ubicacion', 'rol'],
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
      // Estados a los que se puede pasar desde el actual (flujo guiado). Vacío
      // para quien solo supervisa.
      transicionesPermitidas: puedeGestionar ? postulacionService.transicionesDesde(plain.estado) : [],
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
    oferta: {
      id: oferta.id,
      titulo: oferta.titulo,
      habilidadesRequeridas: oferta.habilidadesRequeridas,
      estado: oferta.estado,
      estadoModeracion: oferta.estadoModeracion,
      fechaLimite: oferta.fechaLimite,
      creadaPorUsuarioId: oferta.creadaPorUsuarioId,
      creadaPor: oferta.creadaPor ? oferta.creadaPor.toJSON() : null,
    },
    puedeGestionar,
  });
};

// ── Historial de estados de una postulación (empresa) ────────────────────────
// Lectura para el reclutador responsable y para el admin_empresa (supervisión).
// Usa PostulacionHistorialEstado: no hay otro registro de historial.

exports.getHistorial = async (req, res) => {
  const postulacion = await Postulacion.findByPk(req.params.id, {
    attributes: ['id', 'estado', 'fechaPostulacion', 'createdAt'],
    include: [{ model: Oferta, as: 'oferta', attributes: ['id', 'empresaId', 'creadaPorUsuarioId'] }],
  });
  if (!postulacion) return res.status(404).json({ success: false, message: 'Postulación no encontrada.' });

  const empresa = await _resolverEmpresa(req);
  if (!empresa || postulacion.oferta.empresaId !== empresa.id) {
    return res.status(404).json({ success: false, message: 'Postulación no encontrada.' });
  }
  if (req.miembroEmpresa?.rolInterno === 'reclutador' && postulacion.oferta.creadaPorUsuarioId !== req.usuario.id) {
    return res.status(403).json({
      success: false,
      message: 'Solo el reclutador responsable de esta oferta puede ver este proceso.',
      code: 'NO_ES_RESPONSABLE',
    });
  }

  const historial = await PostulacionHistorialEstado.findAll({
    where: { postulacionId: postulacion.id },
    attributes: ['id', 'estadoAnterior', 'estadoNuevo', 'createdAt'],
    include: [{ model: Usuario, as: 'cambiadoPor', attributes: ['id', 'nombre', 'apellido', 'rol'] }],
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
  });

  return res.json({ success: true, estadoActual: postulacion.estado, data: historial });
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

  // Las acciones operativas sobre un candidato (cambiar estado, nota interna)
  // son del reclutador RESPONSABLE de la oferta. Una oferta sin responsable no
  // la gestiona nadie hasta que el admin_empresa le asigne uno (ya no existe
  // el fallback "cualquier reclutador").
  if (postulacion.oferta.creadaPorUsuarioId !== req.usuario.id) {
    return res.status(403).json({
      success: false,
      message: 'Solo el reclutador responsable de esta oferta puede gestionar a sus candidatos.',
      code: 'NO_ES_RESPONSABLE',
    });
  }

  const estadoAnterior = postulacion.estado;
  const cambiaEstado = Boolean(estado) && estado !== estadoAnterior;

  // Flujo guiado: solo las transiciones permitidas desde el estado actual.
  if (cambiaEstado && !postulacionService.transicionesDesde(estadoAnterior).includes(estado)) {
    return res.status(400).json({
      success: false,
      message: `No se puede pasar de "${estadoAnterior.replace(/_/g, ' ')}" a "${estado.replace(/_/g, ' ')}".`,
      code: 'TRANSICION_NO_PERMITIDA',
      transicionesPermitidas: postulacionService.transicionesDesde(estadoAnterior),
    });
  }

  const updateData = {};
  if (cambiaEstado) updateData.estado = estado;
  if (notasEmpresa !== undefined) {
    // Nota interna: nunca se le muestra al candidato ni se le notifica.
    const nota = typeof notasEmpresa === 'string' ? notasEmpresa.trim() : '';
    updateData.notasEmpresa = nota || null;
  }
  await postulacion.update(updateData);

  if (cambiaEstado) {
    await PostulacionHistorialEstado.create({
      postulacionId: postulacion.id,
      estadoAnterior,
      estadoNuevo: estado,
      cambiadoPorUsuarioId: req.usuario.id,
      notaInterna: updateData.notasEmpresa || null,
    });
  }

  const estadoTexto = {
    preseleccionado: 'Fuiste preseleccionado/a',
    entrevista:      'Tu entrevista fue programada',
    rechazado:       'Tu postulación no fue seleccionada',
    contratado:      '¡Felicitaciones! Fuiste seleccionado/a',
  };

  if (cambiaEstado) {
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

  return res.json({
    success: true,
    message: 'Postulación actualizada.',
    data: {
      ...postulacionService.formatearPostulacion(postulacion),
      transicionesPermitidas: postulacionService.transicionesDesde(postulacion.estado),
    },
  });
};
