/**
 * useNotifCounters — contadores del chrome autenticado (Navbar y shell admin).
 *
 * Se recargan en cada cambio de ruta:
 * - `noLeidas`: endpoint dedicado de conteo (más liviano que traer la lista).
 * - `prioridadAlta`: se piden las últimas sin leer solo para saber si hay
 *   alguna alta/urgente y así colorear el badge.
 * - `mensajesNL`: mensajes de chat sin leer (solo si `incluirChat`; el admin
 *   del sistema no usa chat, así que no se pide).
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { notificacionService } from '../services/notificacion.service';
import { mensajeService } from '../services/chat.service';
import { totalMensajesNoLeidos, EVENTO_CHAT_LEIDO } from '../utils/chatContadores';

export function useNotifCounters(usuario, { incluirChat = true } = {}) {
  const location = useLocation();
  const [noLeidas, setNoLeidas] = useState(0);
  const [prioridadAlta, setPrioridadAlta] = useState(false);
  const [mensajesNL, setMensajesNL] = useState(0);

  // Backend devuelve `noLeidos` por conversación (ver utils/chatContadores).
  const contarMensajes = useCallback(() => {
    mensajeService.getConversaciones()
      .then(({ data }) => setMensajesNL(totalMensajesNoLeidos(data.data ?? data ?? [])))
      .catch(() => { });
  }, []);

  useEffect(() => {
    if (!usuario) return;

    notificacionService.sinLeerCount()
      .then(({ data }) => setNoLeidas(data.count ?? 0))
      .catch(() => { });

    notificacionService.getAll({ leida: false, limit: 20 })
      .then(({ data }) => {
        const sinLeer = data.data ?? data ?? [];
        setPrioridadAlta(sinLeer.some((n) => n.prioridad === 'alta' || n.tipoVisual === 'urgente'));
      })
      .catch(() => { });

    if (!incluirChat) return;
    contarMensajes();
  }, [usuario, location.pathname, incluirChat, contarMensajes]);

  // Al marcar una conversación como leída (useConversacion) el badge se
  // recalcula enseguida: si no, la recarga por cambio de ruta podía llegar
  // antes de que el servidor registrara la lectura y quedaba el número viejo.
  useEffect(() => {
    if (!usuario || !incluirChat) return undefined;
    window.addEventListener(EVENTO_CHAT_LEIDO, contarMensajes);
    return () => window.removeEventListener(EVENTO_CHAT_LEIDO, contarMensajes);
  }, [usuario, incluirChat, contarMensajes]);

  return { noLeidas, prioridadAlta, mensajesNL };
}
