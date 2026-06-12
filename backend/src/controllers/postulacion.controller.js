'use strict';

const { Postulacion, Oferta, Usuario, Perfil, Empresa, ActivityLog } = require('../models');
const { crearNotificacion } = require('../utils/notificador');
const postulacionService = require('../services/postulacion.service');
const empresaService     = require('../services/empresa.service');

const _resolverEmpresa = empresaService.resolverEmpresaDelRequest;

async function logAction(datos) {
  try { await ActivityLog.create(datos); } catch (e) { /* fallo silencioso */ }
}

// ── Postularse ────────────────────────────────────────────────────────────────

exports.postular = async (req, res) => {
  try {
    const { ofertaId, cartaPresentacion } = req.body;
    const usuarioId = req.usuario.id;

    const oferta = await postulacionService.validarPostulacion(usuarioId, ofertaId);

    const postulacion = await Postulacion.create({ usuarioId, ofertaId, cartaPresentacion });

    await crearNotificacion({
      usuarioId: oferta.empresa.usuarioId,
      titulo: 'Nueva postulación recibida',
      mensaje: `${req.usuario.nombre} ${req.usuario.apellido} se postuló a "${oferta.titulo}".`,
      tipo: 'postulacion',
      enlace: `/empresa/postulantes/${ofertaId}`,
      accionURL: `/empresa/postulantes/${ofertaId}`,
    });

    logAction({
      usuarioId,
      accion: 'postular',
      entidad: 'postulacion',
      entidadId: postulacion.id,
      detalle: { ofertaId, ofertaTitulo: oferta.titulo, empresa: oferta.empresa?.razonSocial },
      ip: req.ip,
    });

    return res.status(201).json({
      success: true,
      message: 'Postulación enviada correctamente.',
      data: postulacionService.formatearPostulacion(postulacion),
    });
  } catch (error) {
    if (error.statusCode) {
      const resp = { success: false, message: error.message };
      if (error.code) resp.code = error.code;
      return res.status(error.statusCode).json(resp);
    }
    console.error('Error en postular:', error);
    return res.status(500).json({ success: false, message: 'Error al postularse.' });
  }
};

// ── Historial de postulaciones del alumno ─────────────────────────────────────

exports.getMisPostulaciones = async (req, res) => {
  try {
    const postulaciones = await Postulacion.findAll({
      where: { usuarioId: req.usuario.id },
      include: [{
        model: Oferta,
        as: 'oferta',
        include: [{ model: Empresa, as: 'empresa', attributes: ['razonSocial', 'logo', 'ciudad', 'rubro'] }],
      }],
      order: [['createdAt', 'DESC']],
    });

    const data = postulaciones.map(postulacionService.formatearPostulacion);
    return res.json({ success: true, total: data.length, data });
  } catch (error) {
    console.error('Error en getMisPostulaciones:', error);
    return res.status(500).json({ success: false, message: 'Error al obtener postulaciones.' });
  }
};

// ── Candidatos de una oferta (empresa) ───────────────────────────────────────

exports.getPostulacionesByOferta = async (req, res) => {
  try {
    const empresa = await _resolverEmpresa(req);
    if (!empresa) return res.status(403).json({ success: false, message: 'No tenés un perfil de empresa activo.' });

    const oferta = await Oferta.findOne({ where: { id: req.params.ofertaId, empresaId: empresa.id } });
    if (!oferta) return res.status(404).json({ success: false, message: 'Oferta no encontrada.' });

    const postulaciones = await Postulacion.findAll({
      where: { ofertaId: oferta.id },
      include: [{
        model: Usuario,
        as: 'usuario',
        attributes: { exclude: ['password', 'tokenReset', 'tokenResetExpira'] },
        include: [{ model: Perfil, as: 'perfil' }],
      }],
      order: [['createdAt', 'DESC']],
    });

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

    return res.json({
      success: true,
      total: data.length,
      oferta: { id: oferta.id, titulo: oferta.titulo, habilidadesRequeridas: oferta.habilidadesRequeridas },
      data,
    });
  } catch (error) {
    console.error('Error en getPostulacionesByOferta:', error.message);
    return res.status(500).json({ success: false, message: 'Error al obtener postulaciones.', detail: error.message });
  }
};

// ── Cambiar estado de postulación (empresa) ───────────────────────────────────

exports.updateEstado = async (req, res) => {
  try {
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

    const updateData = {};
    if (estado) updateData.estado = estado;
    if (notasEmpresa !== undefined) updateData.notasEmpresa = notasEmpresa;
    await postulacion.update(updateData);

    const estadoTexto = {
      preseleccionado:       'Fuiste preseleccionado/a',
      entrevista_programada: 'Tu entrevista fue programada',
      entrevista:            'Tu entrevista fue programada',
      no_seleccionado:       'Tu postulación no fue seleccionada',
      rechazado:             'Tu postulación no fue seleccionada',
      contratado:            '¡Felicitaciones! Fuiste seleccionado/a',
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

      logAction({
        usuarioId: req.usuario.id,
        accion: 'cambiar_estado_postulacion',
        entidad: 'postulacion',
        entidadId: postulacion.id,
        detalle: { nuevoEstado: estado, oferta: postulacion.oferta?.titulo },
        ip: req.ip,
      });
    }

    return res.json({ success: true, message: 'Postulación actualizada.', data: postulacionService.formatearPostulacion(postulacion) });
  } catch (error) {
    console.error('Error en updateEstado:', error);
    return res.status(500).json({ success: false, message: 'Error al actualizar el estado.' });
  }
};
