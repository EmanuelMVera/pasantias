/**
 * chatContadores.js — contador global de mensajes de chat sin leer.
 *
 * Contrato canónico: cada conversación de GET /api/chat trae `noLeidos`
 * (chat.service.js). `mensajesNoLeidos` se acepta solo como alias defensivo.
 */

/** Suma los mensajes sin leer de todas las conversaciones. */
export function totalMensajesNoLeidos(conversaciones) {
  if (!Array.isArray(conversaciones)) return 0;
  return conversaciones.reduce((acc, c) => acc + (Number(c?.noLeidos ?? c?.mensajesNoLeidos) || 0), 0);
}

/**
 * Evento de ventana que se emite cuando una conversación se marca como leída
 * en el servidor: el badge global (useNotifCounters) se recalcula sin esperar
 * a un cambio de ruta ni hacer polling.
 */
export const EVENTO_CHAT_LEIDO = 'sispasantias:chat-leido';
