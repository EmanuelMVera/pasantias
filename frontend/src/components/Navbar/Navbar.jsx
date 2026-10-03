/**
 * Navbar.jsx — Barra de navegación de ALUMNO/EGRESADO.
 *
 * Cada perfil tiene su propio chrome (ver `Chrome` en App.jsx): el admin del
 * sistema (components/AdminShell) y el administrador de empresa
 * (components/EmpresaShell) usan sidebar + topbar; el reclutador, su barra
 * horizontal (components/ReclutadorNav).
 *
 * - Badge de notificaciones con prioridad (alta → rojo) y de mensajes de chat.
 * - La campana navega a /notificaciones (y se marca activa ahí).
 * - Avatar + dropdown del usuario en UserMenu (compartido con la topbar admin).
 */

import { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useNotifCounters } from '../../hooks/useNotifCounters';
import Brand from '../Brand/Brand';
import Icon from '../ui/Icon';
import UserMenu from './UserMenu';
import styles from './Navbar.module.css';

export default function Navbar() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { noLeidas, prioridadAlta, mensajesNL } = useNotifCounters(usuario);

  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef(null);

  /* ── Menú móvil: Escape, click fuera y bloqueo de scroll ─────────────── */
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setMobileOpen(false); };
    const onClick = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  if (!usuario) return null;

  /* ── Links según rol ─────────────────────────────────────────────────── */
  const linksAlumnoEgresado = [
    { to: '/dashboard', label: 'Inicio' },
    { to: '/ofertas', label: 'Ofertas' },
    { to: '/mis-postulaciones', label: 'Mis Postulaciones' },
    { to: '/perfil', label: 'Mi Perfil' },
  ];

  // Caso borde: un usuario empresa cuyo rol interno no se pudo resolver (sin
  // membresía activa) cae acá con un único link; el backend decide qué puede hacer.
  const linksEmpresa = [{ to: '/empresa', label: 'Panel' }];

  const links = usuario.rol === 'empresa' ? linksEmpresa : linksAlumnoEgresado;

  /* ── Color del badge de notificaciones según prioridad ───────────────── */
  const notifColor = prioridadAlta
    ? styles.notifBadgeAlta
    : noLeidas > 0
      ? styles.notifBadgeNormal
      : '';

  // La campana no es un NavLink: se marca activa a mano en /notificaciones.
  const enNotificaciones = location.pathname === '/notificaciones';

  return (
    <nav className={styles.navbar} ref={navRef} aria-label="Principal">
      <div className={styles.navbarInner}>

        {/* Marca: completa ≥1024px, compacta en tablet, solo símbolo en mobile */}
        <Brand to="/" variant="full" tone="light" responsive className={styles.navbarBrand} onClick={() => setMobileOpen(false)} />

        {/* Links de navegación (desktop) */}
        <div className={styles.navbarLinks}>
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end
              className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
            >
              {l.label}
            </NavLink>
          ))}
        </div>

        {/* Acciones del usuario */}
        <div className={styles.navbarActions}>

          {/* Botón menú móvil (visible solo en pantallas chicas vía CSS) */}
          <button
            className={styles.navbarToggle}
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={mobileOpen}
            aria-controls="nav-mobile"
          >
            <Icon name={mobileOpen ? 'close' : 'menu'} size={22} />
          </button>

          {/* Mensajes no leídos */}
          <Link
            to="/chat"
            className={`${styles.iconBadgeBtn} ${mensajesNL > 0 ? styles.iconBadgeActive : ''}`}
            title={mensajesNL > 0 ? `${mensajesNL} mensaje${mensajesNL !== 1 ? 's' : ''} sin leer` : 'Chat'}
            aria-label="Chat"
            onClick={() => setMobileOpen(false)}
          >
            <Icon name="message" size={20} />
            {mensajesNL > 0 && (
              <span className={styles.iconBadgeCount}>{mensajesNL > 9 ? '9+' : mensajesNL}</span>
            )}
          </Link>

          {/* Campana de notificaciones — siempre visible; badge solo si hay sin leer */}
          <button
            className={`${styles.notifBadge} ${notifColor} ${enNotificaciones ? styles.notifBadgeActivo : ''}`}
            title={noLeidas > 0 ? `${noLeidas} notificación${noLeidas !== 1 ? 'es' : ''} sin leer` : 'Notificaciones'}
            onClick={() => { setMobileOpen(false); navigate('/notificaciones'); }}
            aria-label="Notificaciones"
            aria-current={enNotificaciones ? 'page' : undefined}
          >
            <Icon name="bell" size={18} />{noLeidas > 0 && <span>{noLeidas > 9 ? '9+' : noLeidas}</span>}
          </button>

          <UserMenu
            tone="dark"
            noLeidas={noLeidas}
            prioridadAlta={prioridadAlta}
            onOpen={() => setMobileOpen(false)}
          />
        </div>
      </div>

      {/* ── Panel de navegación móvil ──────────────────────────────────── */}
      {mobileOpen && (
        <div className={styles.navbarMobilePanel} id="nav-mobile">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end
              className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              {l.label}
            </NavLink>
          ))}
        </div>
      )}
    </nav>
  );
}
