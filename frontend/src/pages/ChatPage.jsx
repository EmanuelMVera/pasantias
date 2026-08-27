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
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { mensajeService } from '../services/api';
import Avatar from '../components/Avatar/Avatar';
import Modal from '../components/Modal/Modal';
import styles from './ChatPage.module.css';

const POLL_INTERVAL = 10_000; // ms

/** Formatea hora para mostrar en burbuja de mensaje */
function formatHora(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

/** Formatea fecha para separadores de día */
function formatFecha(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Etiqueta de rol para el modal de búsqueda */
const ROL_LABEL = {
  alumno:   '🎓 Alumno',
  egresado: '🏅 Egresado',
  empresa:  '🏢 Empresa',
  admin:    '⚙️ Admin',
};

/**
 * Devuelve "Nombre Apellido — Empresa SRL" si el usuario tiene razonSocial.
 * Para alumnos/egresados/admin devuelve solo "Nombre Apellido".
 */
function displayNombre(usuario) {
  const nombre = `${usuario?.nombre ?? ''} ${usuario?.apellido ?? ''}`.trim() || 'Usuario';
  if (usuario?.razonSocial) return `${nombre} — ${usuario.razonSocial}`;
  return nombre;
}

/**
 * Card de conversación en el panel lateral.
 * El backend devuelve: { usuario: {id, nombre, apellido, ...}, ultimoMensaje: {...}, noLeidos: N }
 */
function ConversacionItem({ conv, activo, onClick }) {
  const noLeidos = conv.noLeidos ?? 0;
  return (
    <div
      className={`${styles.convItem} ${activo ? styles.convActivo : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <Avatar
        nombre={conv.usuario?.nombre}
        apellido={conv.usuario?.apellido}
        src={conv.usuario?.fotoPerfil}
        size={36}
        color={activo ? '#fff' : 'var(--primary)'}
        style={{ fontWeight: 800, fontSize: 36 * 0.38 }}
      />
      <div className={styles.convInfo}>
        <div className={styles.convNombreRow}>
          <strong className={styles.convNombre}>
            {displayNombre(conv.usuario)}
          </strong>
          <span className={styles.convHora}>
            {formatHora(conv.ultimoMensaje?.createdAt)}
          </span>
        </div>
        <div className={styles.convPreviewRow}>
          <span className={styles.convPreview}>
            {conv.ultimoMensaje?.mensaje ?? 'Sin mensajes'}
          </span>
          {noLeidos > 0 && (
            <span className={styles.convBadge}>{noLeidos}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Burbuja de mensaje individual */
function BurbujaMensaje({ mensaje, esMio }) {
  return (
    <div className={`${styles.burbujaWrap} ${esMio ? styles.burbujaWrapMia : ''}`}>
      {!esMio && (
        <Avatar
          nombre={mensaje.emisor?.nombre}
          apellido={mensaje.emisor?.apellido}
          src={mensaje.emisor?.fotoPerfil}
          size={30}
          style={{ fontWeight: 800, fontSize: 30 * 0.38 }}
        />
      )}
      <div className={`${styles.burbuja} ${esMio ? styles.burbujaMia : styles.burbujaSuya}`}>
        <p>{mensaje.mensaje ?? mensaje.contenido}</p>
        <span className={styles.burbujaHora}>
          {formatHora(mensaje.createdAt)}
          {esMio && (
            <span className={styles.burbujaLeido} title={mensaje.leido ? 'Leído' : 'Enviado'}>
              {mensaje.leido ? ' ✓✓' : ' ✓'}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/**
 * Modal para iniciar un nuevo chat buscando un usuario.
 */
function NuevoChatModal({ onClose, onSeleccionar }) {
  const [query,       setQuery]       = useState('');
  const [resultados,  setResultados]  = useState([]);
  const [buscando,    setBuscando]    = useState(false);
  const [sinResultados, setSinResultados] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const buscar = (texto) => {
    setQuery(texto);
    setSinResultados(false);
    clearTimeout(debounceRef.current);

    if (texto.trim().length < 2) {
      setResultados([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const { data } = await mensajeService.buscarUsuarios(texto.trim());
        const lista = data.data ?? [];
        setResultados(lista);
        setSinResultados(lista.length === 0);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 300);
  };

  return (
    <Modal
      title="✏️ Nuevo mensaje"
      onClose={onClose}
      style={{ display: 'flex', flexDirection: 'column', maxHeight: '80vh', overflow: 'hidden' }}
    >

        <div className={styles.modalSearch}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar por nombre, apellido o email..."
            value={query}
            onChange={(e) => buscar(e.target.value)}
            className={styles.modalInput}
          />
        </div>

        <div className={styles.modalResultados}>
          {buscando ? (
            <p className={styles.modalEstado}>Buscando...</p>
          ) : sinResultados ? (
            <p className={styles.modalEstado}>No se encontraron usuarios con "{query}".</p>
          ) : resultados.length === 0 && query.length >= 2 ? (
            <p className={styles.modalEstado}>Ingresá un nombre, apellido o email.</p>
          ) : query.length < 2 ? (
            <p className={styles.modalEstado}>Escribí al menos 2 caracteres para buscar.</p>
          ) : null}

          {resultados.map((u) => (
            <div
              key={u.id}
              className={styles.modalResultadoItem}
              onClick={() => onSeleccionar(u)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSeleccionar(u)}
            >
              <Avatar nombre={u.nombre} size={40} />
              <div className={styles.modalResultadoInfo}>
                <strong>{displayNombre(u)}</strong>
                <span>{u.email}</span>
                <span className={styles.modalRolBadge}>{ROL_LABEL[u.rol] ?? u.rol}</span>
              </div>
            </div>
          ))}
        </div>
    </Modal>
  );
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
  const [mensajes,        setMensajes]        = useState([]);
  const [nuevoMensaje,    setNuevoMensaje]    = useState('');
  const [loadingConvs,    setLoadingConvs]    = useState(true);
  const [loadingMensajes, setLoadingMensajes] = useState(false);
  const [enviando,        setEnviando]        = useState(false);
  const [errorConvs,      setErrorConvs]      = useState('');
  const [modalAbierto,    setModalAbierto]    = useState(false);

  const mensajesEndRef = useRef(null);
  const inputRef       = useRef(null);
  const pollRef        = useRef(null);

  /* ── Scroll al último mensaje ──────────────────────────────────────────── */
  const scrollBottom = useCallback(() => {
    mensajesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  /* ── Cargar lista de conversaciones ────────────────────────────────────── */
  const recargarConversaciones = useCallback(() => {
    mensajeService
      .getConversaciones()
      .then(({ data }) => {
        const lista = data.data ?? data ?? [];
        setConversaciones(lista);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
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

  /* ── Cargar mensajes cuando cambia la conversación activa ──────────────── */
  useEffect(() => {
    if (!convActivaId) return;

    const cargarMensajes = async () => {
      setLoadingMensajes(true);
      try {
        const { data } = await mensajeService.getMensajes(convActivaId);
        const lista = data.data ?? data ?? [];
        setMensajes(lista);
        // Capturar datos del interlocutor devueltos por getHistorial.
        // Esto permite mostrar nombre/empresa aunque no haya mensajes previos
        // ni la conversación esté en la lista de conversaciones.
        if (data.usuario) setPartnerInfo(data.usuario);
        mensajeService.marcarLeida(convActivaId).catch(() => {});
        setConversaciones((prev) =>
          prev.map((c) =>
            c.usuario?.id === convActivaId ? { ...c, noLeidos: 0 } : c
          )
        );
      } catch {
        // Fallo silencioso para no interrumpir el polling
      } finally {
        setLoadingMensajes(false);
      }
    };

    cargarMensajes().then(scrollBottom);

    clearInterval(pollRef.current);
    pollRef.current = setInterval(cargarMensajes, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [convActivaId, scrollBottom]);

  useEffect(() => { scrollBottom(); }, [mensajes, scrollBottom]);

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
    } catch {
      setNuevoMensaje(texto);
      alert('No se pudo enviar el mensaje. Intentá de nuevo.');
    } finally {
      setEnviando(false);
      inputRef.current?.focus();
    }
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
      {/* Modal de nuevo chat */}
      {modalAbierto && (
        <NuevoChatModal
          onClose={() => setModalAbierto(false)}
          onSeleccionar={handleSeleccionarUsuario}
        />
      )}

      <div className={styles.chatLayout}>
        {/* ── Panel izquierdo: lista de conversaciones ──────────────────── */}
        <aside className={`${styles.sidebar} ${convActivaId ? styles.sidebarHiddenMobile : ''}`}>
          <div className={styles.sidebarHeader}>
            <h2>💬 Mensajes</h2>
            <button
              className={styles.nuevoChatBtn}
              onClick={() => setModalAbierto(true)}
              title="Nuevo mensaje"
              aria-label="Iniciar nueva conversación"
            >
              ✏️
            </button>
          </div>

          {loadingConvs ? (
            <div className={styles.sidebarLoading}>
              {[1, 2, 3].map((i) => <div key={i} className={styles.skeletonConv} />)}
            </div>
          ) : errorConvs ? (
            <p className={styles.sidebarError}>{errorConvs}</p>
          ) : conversaciones.length === 0 ? (
            <div className={styles.sidebarEmpty}>
              <span>✉️</span>
              <p>No tenés conversaciones aún.</p>
              <button
                className={styles.nuevoChatBtnEmpty}
                onClick={() => setModalAbierto(true)}
              >
                Iniciar una conversación
              </button>
            </div>
          ) : (
            <div className={styles.convList}>
              {conversaciones.map((conv) => {
                const partnerId = conv.usuario?.id;
                return (
                  <ConversacionItem
                    key={partnerId}
                    conv={conv}
                    activo={partnerId === convActivaId}
                    onClick={() => {
                      setConvActivaId(partnerId);
                      setMensajes([]);
                      navigate(`/chat/${partnerId}`, { replace: true });
                    }}
                  />
                );
              })}
            </div>
          )}
        </aside>

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
              <div className={styles.chatHeader}>
                <button
                  className={styles.backBtn}
                  onClick={() => { setConvActivaId(null); navigate('/chat', { replace: true }); }}
                  aria-label="Volver a conversaciones"
                >
                  ←
                </button>
                <Avatar
                  nombre={partnerActivo?.nombre}
                  apellido={partnerActivo?.apellido}
                  src={partnerActivo?.fotoPerfil}
                  size={36}
                  style={{ fontWeight: 800, fontSize: 36 * 0.38 }}
                />
                <div className={styles.chatHeaderInfo}>
                  <strong>
                    {loadingMensajes && !partnerActivo
                      ? 'Cargando...'
                      : displayNombre(partnerActivo)}
                  </strong>
                  <span>{partnerActivo?.email}</span>
                </div>
                {/* Ver perfil — link a perfil público del interlocutor */}
                {(() => {
                  const perfilUrl = partnerActivo?.rol === 'empresa'
                    ? (partnerActivo?.empresaId ? `/empresa/${partnerActivo.empresaId}` : null)
                    : (partnerActivo?.id ? `/perfil/${partnerActivo.id}` : null);
                  return perfilUrl ? (
                    <button
                      className={styles.verPerfilBtn}
                      onClick={() => navigate(perfilUrl)}
                      title="Ver perfil"
                      style={{
                        marginLeft: 'auto',
                        padding: '4px 12px',
                        fontSize: '0.78rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border, #e2e8f0)',
                        background: 'transparent',
                        color: 'var(--primary, #0073AD)',
                        cursor: 'pointer',
                      }}
                    >
                      Ver perfil
                    </button>
                  ) : (
                    <button
                      className={styles.verPerfilBtn}
                      disabled
                      title="Perfil no disponible"
                      style={{
                        marginLeft: 'auto',
                        padding: '4px 12px',
                        fontSize: '0.78rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border, #e2e8f0)',
                        background: 'transparent',
                        color: 'var(--text-muted, #64748b)',
                        cursor: 'not-allowed',
                        opacity: 0.5,
                      }}
                    >
                      Ver perfil
                    </button>
                  );
                })()}
              </div>

              {/* Mensajes */}
              <div className={styles.mensajesArea}>
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

              {/* Input de envío */}
              <form className={styles.inputBar} onSubmit={handleEnviar}>
                <input
                  ref={inputRef}
                  type="text"
                  value={nuevoMensaje}
                  onChange={(e) => setNuevoMensaje(e.target.value)}
                  placeholder="Escribí un mensaje..."
                  disabled={enviando}
                  maxLength={2000}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className={styles.sendBtn}
                  disabled={enviando || !nuevoMensaje.trim()}
                  aria-label="Enviar mensaje"
                >
                  {enviando ? '…' : '➤'}
                </button>
              </form>
            </>
          )}
        </main>
      </div>
    </>
  );
}
