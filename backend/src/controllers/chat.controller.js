'use strict';

const { Mensaje, Usuario } = require('../models');
const { crearNotificacion } = require('../utils/notificador');
const chatPermissionService = require('../services/chatPermission.service');
const chatService           = require('../services/chat.service');

// ── Buscar usuarios ───────────────────────────────────────────────────────────

exports.buscarUsuarios = async (req, res) => {
  try {
    const { id: userId, rol } = req.usuario;
    const q = (req.query.q || '').trim();

    if (q.length < 2) return res.json({ success: true, data: [] });
    if (rol === 'admin') return res.json({ success: true, total: 0, data: [] });

    const data = await chatService.buscarUsuarios(userId, rol, q);
    return res.json({ success: true, total: data.length, data });
  } catch (error) {
    console.error('Error en buscarUsuarios:', error);
    return res.status(500).json({ success: false, message: 'Error al buscar usuarios.' });
  }
};

// ── Lista de conversaciones ───────────────────────────────────────────────────

exports.getConversaciones = async (req, res) => {
  try {
    const conversaciones = await chatService.obtenerConversaciones(req.usuario.id);
    return res.json({ success: true, total: conversaciones.length, data: conversaciones });
  } catch (error) {
    console.error('Error en getConversaciones:', error);
    return res.status(500).json({ success: false, message: 'Error al obtener conversaciones.' });
  }
};

// ── Enviar mensaje ────────────────────────────────────────────────────────────

exports.enviarMensaje = async (req, res) => {
  try {
    const { receptorId, mensaje } = req.body;
    const emisorId = req.usuario.id;

    if (Number(receptorId) === emisorId) {
      return res.status(400).json({ success: false, message: 'No podés enviarte mensajes a vos mismo.' });
    }

    const receptor = await Usuario.findOne({
      where: { id: receptorId, activo: true },
      attributes: ['id', 'nombre', 'apellido', 'rol'],
    });
    if (!receptor) {
      return res.status(404).json({ success: false, message: 'El destinatario no existe o está inactivo.' });
    }

    const { ok, motivo } = await chatPermissionService.puedeChatear(emisorId, Number(receptorId));
    if (!ok) return res.status(403).json({ success: false, message: motivo });

    if (!mensaje || mensaje.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'El mensaje no puede estar vacío.' });
    }
    if (mensaje.length > 2000) {
      return res.status(400).json({ success: false, message: 'El mensaje no puede superar los 2000 caracteres.' });
    }

    const nuevoMensaje = await Mensaje.create({
      emisorId,
      receptorId: Number(receptorId),
      mensaje: mensaje.trim(),
    });

    const debeNotificar = await chatService.debeNotificarMensaje(emisorId, Number(receptorId), nuevoMensaje.id);
    if (debeNotificar) {
      const emisor = await Usuario.findByPk(emisorId, { attributes: ['nombre', 'apellido'] });
      const nombreEmisor = emisor ? `${emisor.nombre} ${emisor.apellido}`.trim() : 'Alguien';
      const preview = mensaje.trim().length > 80 ? mensaje.trim().slice(0, 80) + '…' : mensaje.trim();

      crearNotificacion({
        usuarioId: Number(receptorId),
        titulo: `Nuevo mensaje de ${nombreEmisor}`,
        mensaje: preview,
        tipo: 'chat',
        prioridad: 'normal',
        enlace: `/chat/${emisorId}`,
        accionURL: `/chat/${emisorId}`,
      }).catch((err) => console.error('[Chat] Error al notificar mensaje:', err.message));
    }

    return res.status(201).json({ success: true, message: 'Mensaje enviado.', data: nuevoMensaje });
  } catch (error) {
    console.error('Error en enviarMensaje:', error);
    return res.status(500).json({ success: false, message: 'Error al enviar el mensaje.' });
  }
};

// ── Historial de mensajes ─────────────────────────────────────────────────────

exports.getHistorial = async (req, res) => {
  try {
    const userId    = req.usuario.id;
    const partnerId = Number(req.params.usuarioId);
    const limite    = Math.min(parseInt(req.query.limit) || 50, 100);
    const pagina    = Math.max(parseInt(req.query.page) || 1, 1);

    if (partnerId === userId) {
      return res.status(400).json({ success: false, message: 'No podés chatear con vos mismo.' });
    }

    const { ok, motivo } = await chatPermissionService.puedeChatear(userId, partnerId);
    if (!ok) return res.status(403).json({ success: false, message: motivo });

    const resultado = await chatService.obtenerHistorial(userId, partnerId, limite, pagina);
    if (!resultado) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    }

    return res.json({ success: true, ...resultado });
  } catch (error) {
    console.error('Error en getHistorial:', error);
    return res.status(500).json({ success: false, message: 'Error al obtener el historial.' });
  }
};

// ── Marcar conversación como leída ────────────────────────────────────────────

exports.marcarLeida = async (req, res) => {
  try {
    const userId    = req.usuario.id;
    const partnerId = Number(req.params.usuarioId);

    const [updated] = await Mensaje.update(
      { leido: true },
      { where: { emisorId: partnerId, receptorId: userId, leido: false } }
    );

    return res.json({
      success: true,
      message: `${updated} mensaje(s) marcado(s) como leído(s).`,
      actualizados: updated,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error al marcar mensajes como leídos.' });
  }
};
