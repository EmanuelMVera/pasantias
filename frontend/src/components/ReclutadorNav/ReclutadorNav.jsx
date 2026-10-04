/**
 * ReclutadorNav.jsx — navegación del RECLUTADOR (workspace operativo).
 *
 * Barra HORIZONTAL propia: el reclutador no usa sidebar (eso es del admin del
 * sistema y del administrador de empresa) ni el Navbar del alumno. Ver `Chrome`
 * en App.jsx.
 *
 *   SisPasantías   Inicio · Mis ofertas · Candidatos      [+ Nueva oferta]  Chat  Campana  Diego Herrera ▾
 *
 * - Navegación principal: solo el trabajo diario (inicio, sus ofertas, sus
 *   candidatos). Ver empresa y Seguridad son secundarios y viven en el menú de
 *   usuario (`menuUsuarioReclutador`). No hay "Equipo": es del administrador de
 *   empresa (la ruta /empresa/equipo redirige al reclutador a /empresa).
 * - "+ Nueva oferta" es la ÚNICA acción global de creación: las páginas no la
 *   repiten en su cabecera (solo un EmptyState cuando no hay ofertas). Se
 *   oculta mientras se crea o edita una oferta.
 * - Identidad: el reclutador es una PERSONA de la empresa (nombre completo).
 * - Móvil (<900px): hamburguesa con los 3 links + Nueva oferta (una sola vez;
 *   el botón de escritorio se oculta). Chat, campana y usuario quedan siempre
 *   a la vista, sin duplicarse en el panel.
 *
 * Contratos compartidos con el resto de los shells (los usan los E2E):
 * `nav[aria-label="Principal"]`, panel `#nav-mobile`, botón
 * `[aria-controls="nav-mobile"]` y el trigger único `[aria-haspopup="true"]`.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useEmpresa } from '../../hooks/useEmpresa';
import { useNotifCounters } from '../../hooks/useNotifCounters';
import Brand from '../Brand/Brand';
import Icon from '../ui/Icon';
import UserMenu from '../Navbar/UserMenu';
import { RECLUTADOR_LINKS, menuUsuarioReclutador } from './navReclutador';
import styles from './ReclutadorNav.module.css';

export default function ReclutadorNav() {
  const { usuario } = useAuth();
  const { empresa } = useEmpresa();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { noLeidas, prioridadAlta, mensajesNL } = useNotifCounters(usuario);

  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  /* Panel móvil: Escape, click afuera y bloqueo de scroll. */
  useEffect(() => {
    if (!abierto) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setAbierto(false); };
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
      document.body.style.overflow = '';
    };
  }, [abierto]);

  if (!usuario) return null;

  const cerrar = () => setAbierto(false);
  const enNotificaciones = pathname === '/notificaciones';
  const enChat = pathname === '/chat' || pathname.startsWith('/chat/');
  // El CTA global "Nueva oferta" se oculta mientras se crea o edita una oferta:
  // llevaría a la página actual o interrumpiría la edición en curso.
  const editandoOferta = pathname === '/empresa/nueva-oferta' || /^\/empresa\/ofertas\/[^/]+\/editar\/?$/.test(pathname);

  const renderLinks = (claseLink) => RECLUTADOR_LINKS.map((l) => {
    const activo = l.match(pathname);
    return (
      <Link
        key={l.to}
        to={l.to}
        className={`${claseLink} ${activo ? styles.activo : ''}`}
        aria-current={activo ? 'page' : undefined}
        onClick={cerrar}
      >
        {l.label}
      </Link>
    );
  });

  const nuevaOferta = (clase) => !editandoOferta && (
    <Link
      to="/empresa/nueva-oferta"
      className={`${styles.nuevaOferta} ${clase}`}
      onClick={cerrar}
    >
      <Icon name="plus" size={18} strokeWidth={2.2} />
      Nueva oferta
    </Link>
  );

  return (
    <header className={styles.barra} ref={ref}>
      <div className={styles.inner}>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setAbierto((v) => !v)}
          aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={abierto}
          aria-controls="nav-mobile"
        >
          <Icon name={abierto ? 'close' : 'menu'} size={22} />
        </button>

        <Brand to="/empresa" variant="compact" tone="light" size={32} responsive className={styles.marca} onClick={cerrar} />

        <nav className={styles.links} aria-label="Principal">
          {renderLinks(styles.link)}
        </nav>

        <div className={styles.acciones}>
          {nuevaOferta(styles.nuevaOfertaDesktop)}

          <Link
            to="/chat"
            className={`${styles.icono} ${enChat ? styles.iconoActivo : ''}`}
            title={mensajesNL > 0 ? `${mensajesNL} mensaje${mensajesNL !== 1 ? 's' : ''} sin leer` : 'Chat'}
            aria-label="Chat"
            aria-current={enChat ? 'page' : undefined}
            onClick={cerrar}
          >
            <Icon name="message" size={20} />
            {mensajesNL > 0 && <span className={styles.contador}>{mensajesNL > 9 ? '9+' : mensajesNL}</span>}
          </Link>

          <button
            type="button"
            className={`${styles.icono} ${enNotificaciones ? styles.iconoActivo : ''}`}
            title={noLeidas > 0 ? `${noLeidas} notificación${noLeidas !== 1 ? 'es' : ''} sin leer` : 'Notificaciones'}
            aria-label="Notificaciones"
            aria-current={enNotificaciones ? 'page' : undefined}
            onClick={() => { cerrar(); navigate('/notificaciones'); }}
          >
            <Icon name="bell" size={20} />
            {noLeidas > 0 && (
              <span className={`${styles.contador} ${prioridadAlta ? styles.contadorAlta : ''}`}>
                {noLeidas > 9 ? '9+' : noLeidas}
              </span>
            )}
          </button>

          <UserMenu
            tone="dark"
            nombreCompleto
            noLeidas={noLeidas}
            prioridadAlta={prioridadAlta}
            onOpen={cerrar}
            links={menuUsuarioReclutador(empresa?.id)}
          />
        </div>
      </div>

      {abierto && (
        <nav className={styles.panel} id="nav-mobile" aria-label="Principal">
          {renderLinks(styles.panelLink)}
          {nuevaOferta(styles.nuevaOfertaPanel)}
        </nav>
      )}
    </header>
  );
}
