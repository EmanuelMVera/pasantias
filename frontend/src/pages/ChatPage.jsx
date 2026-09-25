/**
 * ChatPage.jsx — Sistema de mensajería interna de la plataforma.
 *
 * Rutas: /chat  y  /chat/:usuarioId
 *
 * Funciones:
 *  - Lista de conversaciones activas en el panel izquierdo
 *  - Botón "Nuevo Chat" con modal de búsqueda de usuarios
 *  - Mensajes de la conversación seleccionada en el panel derecho
 *  - Envío de nuevos mensajes
 *  - Marca como leído al abrir una conversación
 *  - Sincronización de mensajes cada 10 segundos (polling)
 *
 * Endpoints que consume (todos bajo /api/chat):
 *  GET    /api/chat                    → lista de conversaciones
 *  GET    /api/chat/usuarios?q=texto   → buscar usuarios para nuevo chat
 *  GET    /api/chat/:usuarioId         → historial con un usuario
 *  POST   /api/chat                    → enviar { receptorId, mensaje }
 *  PATCH  /api/chat/:usuarioId/leer    → marcar conversación como leída
 *
 * La carga/polling/paginación/envío de la conversación activa vive en
 * hooks/useConversacion.js; esta página coordina la lista, el interlocutor
 * activo y la navegación.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useConversacion } from '../hooks/useConversacion';
import { mensajeService } from '../services/chat.service';
import ListaConversaciones from '../components/ListaConversaciones/ListaConversaciones';
import ChatHeader from '../components/ChatHeader/ChatHeader';
import BurbujaMensaje from '../components/BurbujaMensaje/BurbujaMensaje';
import Composer from '../components/Composer/Composer';
import NuevoChatModal from '../components/NuevoChatModal/NuevoChatModal';
import Toast from '../components/ui/Toast';
import { useToast } from '../hooks/useToast';
import styles from './ChatPage.module.css';

/** Formatea fecha para separadores de día */
function formatFecha(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/* ── Componente principal ──────────────────────────────────────────────────── */
export default function ChatPage() {
  const { usuarioId: usuarioIdParam } = useParams();
  const { usuario }                   = useAuth();
  const navigate                      = useNavigate();

  const [conversaciones,  setConversaciones]  = useState([]);
  const [convActivaId,    setConvActivaId]    = useState(
    usuarioIdParam ? Number(usuarioIdParam) : null
  );
  // partnerInfo: datos del interlocutor activo, poblado desde getHistorial.
  // Cubre el caso en que no hay conversación previa (convActivaObj undefined).
  const [partnerInfo,     setPartnerInfo]     = useState(null);
  const [loadingConvs,    setLoadingConvs]    = useState(true);
  const [errorConvs,      setErrorConvs]      = useState('');
  const [modalAbierto,    setModalAbierto]    = useState(false);
  const { toast, showToast } = useToast();

  useEffect(() => {
    // Comportamiento previo intencional: al cambiar :usuarioId se recarga la
    // lista y se vuelve a mostrar el skeleton.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingConvs(true);
    mensajeService
      .getConversaciones()
      .then(({ data }) => {
        const lista = data.data ?? data ?? [];
        setConversaciones(lista);
        if (usuarioIdParam) {
          setConvActivaId(Number(usuarioIdParam));
        }
      })
      .catch(() => setErrorConvs('No se pudo cargar las conversaciones.'))
      .finally(() => setLoadingConvs(false));
  }, [usuarioIdParam]);

  const {
    mensajes, setMensajes,
    nuevoMensaje, setNuevoMensaje,
    loadingMensajes, loadingViejos, enviando,
    soloLectura, motivoSoloLectura, errorConv,
    mensajesEndRef, mensajesAreaRef, inputRef,
    handleScrollMensajes, handleEnviar,
  } = useConversacion({ convActivaId, setConversaciones, setPartnerInfo, showToast });

  /* ── Volver a la lista (sin conversación activa) ───────────────────────── */
  const volverALista = () => { setConvActivaId(null); navigate('/chat', { replace: true }); };

  /* ── Seleccionar una conversación existente de la lista ────────────────── */
  const handleSeleccionarConversacion = (partnerId) => {
    setConvActivaId(partnerId);
    setMensajes([]);
    navigate(`/chat/${partnerId}`, { replace: true });
  };

  /* ── Seleccionar usuario desde el modal de nuevo chat ──────────────────── */
  const handleSeleccionarUsuario = (usuarioSeleccionado) => {
    setModalAbierto(false);
    const partnerId = usuarioSeleccionado.id;

    // Guardar datos del interlocutor inmediatamente para que el header
    // lo muestre antes de que getHistorial responda.
    setPartnerInfo(usuarioSeleccionado);

    // Si ya existe la conversación, abrirla; si no, agregar entrada temporal
    const existente = conversaciones.find((c) => c.usuario?.id === partnerId);
    if (!existente) {
      setConversaciones((prev) => [
        { usuario: usuarioSeleccionado, ultimoMensaje: null, noLeidos: 0 },
        ...prev,
      ]);
    }

    setMensajes([]);
    setConvActivaId(partnerId);
    navigate(`/chat/${partnerId}`, { replace: true });
  };

  /* ── Conversación activa (objeto completo) ─────────────────────────────── */
  const convActivaObj = conversaciones.find((c) => c.usuario?.id === convActivaId);
  // partnerActivo: interlocutor real. Usa la conversación de la lista si existe;
  // si no (primera vez sin mensajes), usa partnerInfo cargado desde getHistorial.
  const partnerActivo = convActivaObj?.usuario ?? partnerInfo;

  return (
    <>
      <Toast toast={toast} />

      {/* Modal de nuevo chat */}
      {modalAbierto && (
        <NuevoChatModal
          onClose={() => setModalAbierto(false)}
          onSeleccionar={handleSeleccionarUsuario}
        />
      )}

      <div className={styles.chatLayout}>
        {/* ── Panel izquierdo: lista de conversaciones ──────────────────── */}
        <ListaConversaciones
          conversaciones={conversaciones}
          convActivaId={convActivaId}
          loading={loadingConvs}
          error={errorConvs}
          onNuevoChat={() => setModalAbierto(true)}
          onSeleccionar={handleSeleccionarConversacion}
        />

        {/* ── Panel derecho: vista de mensajes ──────────────────────────── */}
        <main className={`${styles.chatMain} ${!convActivaId ? styles.chatMainHiddenMobile : ''}`}>
          {!convActivaId ? (
            <div className={styles.chatEmpty}>
              <span>💬</span>
              <h3>Seleccioná una conversación</h3>
              <p>Elegí un contacto de la lista o iniciá un nuevo chat.</p>
              <button
                className={styles.nuevoChatBtnEmpty}
                onClick={() => setModalAbierto(true)}
              >
                ✏️ Nuevo mensaje
              </button>
            </div>
          ) : (
            <>
              {/* Encabezado de la conversación */}
              <ChatHeader
                partnerActivo={partnerActivo}
                loadingMensajes={loadingMensajes}
                onVolver={volverALista}
              />

              {errorConv && mensajes.length === 0 ? (
                /* Acceso inválido a esta conversación (URL directa a un usuario
                   sin relación habilitada, o relación revocada) — estado de
                   error explícito en vez de spinner infinito o pantalla en blanco. */
                <div className={styles.chatEmpty}>
                  <span>⚠️</span>
                  <h3>No se pudo abrir esta conversación</h3>
                  <p>{errorConv}</p>
                  <button
                    className={styles.nuevoChatBtnEmpty}
                    onClick={volverALista}
                  >
                    Volver a conversaciones
                  </button>
                </div>
              ) : (
                <>
                  {/* Mensajes */}
                  <div
                    className={styles.mensajesArea}
                    ref={mensajesAreaRef}
                    onScroll={handleScrollMensajes}
                  >
                    {loadingViejos && (
                      <p className={styles.cargandoMsg}>Cargando mensajes anteriores…</p>
                    )}
                    {loadingMensajes && mensajes.length === 0 ? (
                      <p className={styles.cargandoMsg}>Cargando mensajes...</p>
                    ) : mensajes.length === 0 ? (
                      <p className={styles.cargandoMsg}>
                        Aún no hay mensajes. ¡Escribí el primero!
                      </p>
                    ) : (
                      <>
                        {mensajes.map((m, idx) => {
                          const esMio = m.emisorId === usuario?.id;
                          const fechaAnterior = idx > 0 ? mensajes[idx - 1].createdAt : null;
                          const mismaFecha = fechaAnterior &&
                            new Date(m.createdAt).toDateString() === new Date(fechaAnterior).toDateString();
                          return (
                            <div key={m.id}>
                              {!mismaFecha && (
                                <div className={styles.fechaSep}>
                                  <span>{formatFecha(m.createdAt)}</span>
                                </div>
                              )}
                              <BurbujaMensaje mensaje={m} esMio={esMio} />
                            </div>
                          );
                        })}
                        <div ref={mensajesEndRef} />
                      </>
                    )}
                  </div>

                  <Composer
                    inputRef={inputRef}
                    valor={nuevoMensaje}
                    onChange={setNuevoMensaje}
                    onSubmit={handleEnviar}
                    enviando={enviando}
                    soloLectura={soloLectura}
                    motivoSoloLectura={motivoSoloLectura}
                  />
                </>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}
