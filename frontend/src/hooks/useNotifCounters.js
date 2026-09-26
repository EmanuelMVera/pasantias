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

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { notificacionService } from '../services/notificacion.service';
import { mensajeService } from '../services/chat.service';

export function useNotifCounters(usuario, { incluirChat = true } = {}) {
  const location = useLocation();
  const [noLeidas, setNoLeidas] = useState(0);
  const [prioridadAlta, setPrioridadAlta] = useState(false);
  const [mensajesNL, setMensajesNL] = useState(0);

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
    mensajeService.getConversaciones()
      .then(({ data }) => {
        const lista = data.data ?? data ?? [];
        const total = lista.reduce((acc, c) => acc + (c.mensajesNoLeidos ?? 0), 0);
        setMensajesNL(total);
      })
      .catch(() => { });
  }, [usuario, location.pathname, incluirChat]);

  return { noLeidas, prioridadAlta, mensajesNL };
}
