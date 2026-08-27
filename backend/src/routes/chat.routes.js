/**
 * chat.routes.js — Rutas del sistema de mensajería directa.
 *
 * Prefijo de la API: /api/chat
 *
 * Todas las rutas requieren autenticación (cualquier rol).
 *
 * ⚠️ ORDEN IMPORTANTE: rutas fijas (/usuarios, /:usuarioId/leer) deben ir
 *    ANTES de '/:usuarioId' para que Express no las trate como parámetro.
 *
 * Rutas disponibles:
 * - GET   /usuarios               → Buscar usuarios para iniciar chat (q=texto)
 * - GET   /                       → Lista de conversaciones del usuario autenticado
 * - POST  /                       → Enviar un mensaje a otro usuario
 * - PATCH /:usuarioId/leer        → Marcar conversación como leída manualmente
 * - GET   /:usuarioId             → Historial con un usuario (marca como leído)
 */

'use strict';

const router = require('express').Router();
const { verifyToken } = require('../middleware/auth.middleware');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/chat.controller');

// Todos los endpoints de chat requieren estar autenticado (cualquier rol)
router.use(verifyToken);

// GET  /api/chat/usuarios?q=texto — Busca usuarios para iniciar un nuevo chat
// ⚠️ Debe ir ANTES de GET /:usuarioId para que Express no confunda 'usuarios' con un ID
router.get('/usuarios', asyncHandler(ctrl.buscarUsuarios));

// GET  /api/chat — Lista de conversaciones con último mensaje y no leídos
router.get('/', asyncHandler(ctrl.getConversaciones));

// POST /api/chat — Enviar mensaje: { receptorId, mensaje }
router.post('/', asyncHandler(ctrl.enviarMensaje));

// PATCH /api/chat/:usuarioId/leer — Marcar conversación como leída
// ⚠️ Debe ir ANTES de GET /:usuarioId para evitar conflicto de rutas
router.patch('/:usuarioId/leer', asyncHandler(ctrl.marcarLeida));

// GET  /api/chat/:usuarioId — Historial paginado con un usuario
router.get('/:usuarioId', asyncHandler(ctrl.getHistorial));

module.exports = router;
