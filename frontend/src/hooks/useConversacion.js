/**
 * useConversacion — estado y sincronización de la conversación activa del chat.
 *
 * Encapsula lo que antes vivía inline en ChatPage: carga del historial (con
 * polling cada 10s que fusiona con lo ya cargado), paginación hacia atrás por
 * scroll, envío optimista de mensajes y manejo del modo solo lectura / 403.
 *
 * La lista de conversaciones y el interlocutor (`partnerInfo`) siguen siendo
 * estado de la página: este hook solo los actualiza vía los setters recibidos.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { mensajeService } from '../services/chat.service';
import { EVENTO_CHAT_LEIDO } from '../utils/chatContadores';

const POLL_INTERVAL = 10_000; // ms

export function useConversacion({ convActivaId, setConversaciones, setPartnerInfo, showToast }) {
  const [mensajes,          setMensajes]          = useState([]);
  const [nuevoMensaje,      setNuevoMensaje]      = useState('');
  const [loadingMensajes,   setLoadingMensajes]   = useState(false);
  const [loadingViejos,     setLoadingViejos]     = useState(false);
  const [pagHist,           setPagHist]           = useState(null); // { page, limit, total, totalPages }
  const [enviando,          setEnviando]          = useState(false);
  const [soloLectura,       setSoloLectura]       = useState(false);
  const [motivoSoloLectura, setMotivoSoloLectura] = useState('');
  const [errorConv,         setErrorConv]         = useState(''); // 403 al abrir/pollear la conversación activa

  const mensajesEndRef  = useRef(null);
  const mensajesAreaRef = useRef(null);
  const inputRef        = useRef(null);
  const pollRef         = useRef(null);

  /* Une dos listas de mensajes por id, en orden cronológico. */
  const mergeMensajes = useCallback((a, b) => {
    const map = new Map();
    for (const m of a) map.set(m.id, m);
    for (const m of b) map.set(m.id, m);
    return [...map.values()].sort(
      (x, y) => new Date(x.createdAt) - new Date(y.createdAt) || x.id - y.id
    );
  }, []);

  /* ── Scroll al último mensaje ──────────────────────────────────────────── */
  const scrollBottom = useCallback(() => {
    mensajesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  /* ── Cargar mensajes cuando cambia la conversación activa ──────────────── */
  useEffect(() => {
    if (!convActivaId) return;

    // Trae la página 1 (mensajes más nuevos) y la fusiona con lo ya cargado
    // (así el poller de 10s no borra las páginas viejas traídas por scroll).
    const cargarNuevos = async ({ inicial = false } = {}) => {
      if (inicial) setLoadingMensajes(true);
      try {
        const { data } = await mensajeService.getMensajes(convActivaId, { page: 1 });
        const lista = data.data ?? data ?? [];
        setMensajes((prev) => (inicial ? lista : mergeMensajes(prev, lista)));
        // El poller trae la página 1: actualiza total/totalPages pero NO pisa
        // el "hasta qué página vieja llegó" el usuario con scroll.
        setPagHist((prev) => {
          if (!data.pagination) return prev;
          if (!prev || inicial) return data.pagination;
          return { ...data.pagination, page: Math.max(prev.page, data.pagination.page) };
        });
        if (data.usuario) setPartnerInfo(data.usuario);
        setSoloLectura(!!data.soloLectura);
        setMotivoSoloLectura(data.motivoSoloLectura || '');
        setErrorConv('');
        mensajeService.marcarLeida(convActivaId)
          // Al abrir la conversación, el badge global se recalcula recién
          // cuando el servidor ya registró la lectura.
          .then(() => { if (inicial) window.dispatchEvent(new Event(EVENTO_CHAT_LEIDO)); })
          .catch(() => {});
        setConversaciones((prev) =>
          prev.map((c) => (c.usuario?.id === convActivaId ? { ...c, noLeidos: 0 } : c))
        );
      } catch (err) {
        if (err.response?.status === 403) {
          setErrorConv(err.response?.data?.message || 'No tenés acceso a esta conversación.');
          clearInterval(pollRef.current); // la relación no es válida: no tiene sentido seguir pollendo
        }
        // otros errores: fallo silencioso, no interrumpe el polling
      } finally {
        if (inicial) setLoadingMensajes(false);
      }
    };

    setMensajes([]);
    setPagHist(null);
    setSoloLectura(false);
    setMotivoSoloLectura('');
    setErrorConv('');
    cargarNuevos({ inicial: true }).then(scrollBottom);

    clearInterval(pollRef.current);
    pollRef.current = setInterval(() => cargarNuevos(), POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [convActivaId, scrollBottom, mergeMensajes, setConversaciones, setPartnerInfo]);

  /* ── Cargar mensajes ANTIGUOS al scrollear hacia arriba ───────────────── */
  const cargarViejos = useCallback(async () => {
    if (loadingViejos || !pagHist || pagHist.page >= pagHist.totalPages) return;
    setLoadingViejos(true);
    const area = mensajesAreaRef.current;
    const alturaPrevia = area?.scrollHeight ?? 0;
    try {
      const paginaVieja = pagHist.page + 1;
      const { data } = await mensajeService.getMensajes(convActivaId, { page: paginaVieja });
      const viejos = data.data ?? [];
      setMensajes((prev) => mergeMensajes(viejos, prev));
      setPagHist((prev) => ({ ...(data.pagination ?? prev), page: paginaVieja }));
      // Preservar la posición de scroll: el contenido creció hacia arriba.
      requestAnimationFrame(() => {
        if (area) area.scrollTop = area.scrollHeight - alturaPrevia;
      });
    } catch {
      // silencioso
    } finally {
      setLoadingViejos(false);
    }
  }, [convActivaId, pagHist, loadingViejos, mergeMensajes]);

  const handleScrollMensajes = (e) => {
    if (e.target.scrollTop < 80) cargarViejos();
  };

  // Auto-scroll al fondo solo cuando llegan mensajes nuevos (no al cargar viejos).
  useEffect(() => { if (!loadingViejos) scrollBottom(); }, [mensajes, loadingViejos, scrollBottom]);

  /* ── Enviar mensaje ────────────────────────────────────────────────────── */
  const handleEnviar = async (e) => {
    e.preventDefault();
    const texto = nuevoMensaje.trim();
    if (!texto || !convActivaId || enviando) return;

    setEnviando(true);
    setNuevoMensaje('');
    try {
      const { data } = await mensajeService.enviar({
        receptorId: convActivaId,
        mensaje: texto,
      });
      const nuevo = data.data ?? data;
      setMensajes((prev) => [...prev, nuevo]);
      // Actualizar el último mensaje en la lista de conversaciones
      setConversaciones((prev) =>
        prev.map((c) =>
          c.usuario?.id === convActivaId ? { ...c, ultimoMensaje: nuevo } : c
        )
      );
    } catch (err) {
      setNuevoMensaje(texto);
      const msg = err.response?.data?.message || 'No se pudo enviar el mensaje. Intentá de nuevo.';
      showToast(msg, 'error');
      if (err.response?.status === 403) {
        // La relación pasó a solo lectura (o se bloqueó) entre la apertura
        // del chat y el envío — reflejarlo sin esperar al próximo poll.
        setSoloLectura(true);
        setMotivoSoloLectura(msg);
      }
    } finally {
      setEnviando(false);
      inputRef.current?.focus();
    }
  };

  return {
    mensajes, setMensajes,
    nuevoMensaje, setNuevoMensaje,
    loadingMensajes, loadingViejos, enviando,
    soloLectura, motivoSoloLectura, errorConv,
    mensajesEndRef, mensajesAreaRef, inputRef,
    handleScrollMensajes, handleEnviar,
  };
}
