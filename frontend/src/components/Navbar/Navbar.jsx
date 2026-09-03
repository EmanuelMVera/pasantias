/**
 * Navbar.jsx — Barra de navegación principal del sistema (usuarios autenticados).
 *
 * Mejoras v2:
 * - Badge de notificaciones con prioridad (alta → rojo, media → naranja, baja → gris)
 * - Badge de mensajes no leídos (chat)
 * - Clic en badge de notificaciones navega a /notificaciones
 * - Avatar con fotoPerfil del usuario
 * - Dropdown muestra nombre + email + rol + datos adicionales
 * - Sticky + shadow al hacer scroll
 */

import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { notificacionService, mensajeService } from '../../services/api';
import Avatar from '../Avatar/Avatar';
import styles from './Navbar.module.css';

export default function Navbar() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [noLeidas, setNoLeidas] = useState(0);
  const [prioridadAlta, setPrioridadAlta] = useState(false);
  const [mensajesNL, setMensajesNL] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef(null);
  const navRef = useRef(null);

  /* ── Recargar contadores al cambiar de ruta ──────────────────────────── */
  useEffect(() => {
    if (!usuario) return;

    // Notificaciones: el conteo usa el endpoint dedicado (más liviano que traer
    // la lista completa); la lista solo se pide para saber si hay alguna sin
    // leer de prioridad alta/urgente y así colorear el badge.
    notificacionService.sinLeerCount()
      .then(({ data }) => setNoLeidas(data.count ?? 0))
      .catch(() => { });

    notificacionService.getAll({ leida: false, limit: 20 })
      .then(({ data }) => {
        const sinLeer = data.data ?? data ?? [];
        setPrioridadAlta(sinLeer.some((n) => n.prioridad === 'alta' || n.tipoVisual === 'urgente'));
      })
      .catch(() => { });

    // Mensajes no leídos
    mensajeService.getConversaciones()
      .then(({ data }) => {
        const lista = data.data ?? data ?? [];
        const total = lista.reduce((acc, c) => acc + (c.mensajesNoLeidos ?? 0), 0);
        setMensajesNL(total);
      })
      .catch(() => { });
  }, [usuario, location.pathname]);

  /* ── Cerrar menú al hacer click fuera ────────────────────────────────── */
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  const handleLogout = async () => {
    setMenuOpen(false);
    // Esperar a que se limpie la sesión ANTES de navegar: si no, `usuario`
    // sigue presente, AppRoutes rebota a la home del rol y esa página dispara
    // fetches que terminan en 401 → hard redirect a /login.
    await logout();
    navigate('/');
  };

  if (!usuario) return null;

  /* ── Links según rol ─────────────────────────────────────────────────── */
  const linksAlumnoEgresado = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/ofertas', label: 'Ofertas' },
    { to: '/mis-postulaciones', label: 'Mis Postulaciones' },
    { to: '/perfil', label: 'Mi Perfil' },
  ];

  const linksEmpresa = [
    { to: '/empresa', label: 'Panel' },
    { to: '/empresa/nueva-oferta', label: '+ Nueva Oferta' },
    { to: '/empresa/equipo', label: 'Equipo' },
  ];


  const linksAdmin = [
    { to: '/admin', label: 'Dashboard' },
    { to: '/admin/solicitudes', label: '📋 Solicitudes' },
    { to: '/admin/ofertas', label: '📣 Ofertas' },
    { to: '/admin/usuarios', label: '👥 Usuarios' },
    { to: '/admin/logs', label: 'Historial de Accesos' },
  ];

  const getLinks = () => {
    switch (usuario.rol) {
      case 'admin': return linksAdmin;
      case 'empresa': return linksEmpresa;
      case 'alumno':
      case 'egresado':
      default: return linksAlumnoEgresado;
    }
  };

  const links = getLinks();

  const esActivo = (to) => {
    if (to === '/') return location.pathname === '/';
    // Match exacto o subruta (ej: estando en /empresa/nueva-oferta, "Panel"
    // (/empresa) queda activo). Es solo estilo; que "Panel" y "+ Nueva Oferta"
    // queden ambos marcados en esa ruta es aceptable.
    return location.pathname === to || location.pathname.startsWith(to + '/');
  };


  /* ── Color del badge de notificaciones según prioridad ───────────────── */
  const notifColor = prioridadAlta
    ? styles.notifBadgeAlta
    : noLeidas > 0
      ? styles.notifBadgeNormal
      : '';

  return (
    <nav className={styles.navbar} ref={navRef}>
      <div className={styles.navbarInner}>

        {/* Logo */}
        <Link to="/" className={styles.navbarBrand}>
          <span className={styles.brandIcon} aria-hidden="true">🎓</span>
          <span>SisPasantías</span>
        </Link>

        {/* Links de navegación (desktop) */}
        <div className={styles.navbarLinks}>
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`${styles.navLink} ${esActivo(l.to) ? styles.active : ''}`}
            >
              {l.label}
            </Link>
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
            <span aria-hidden="true">{mobileOpen ? '✕' : '☰'}</span>
          </button>

          {/* Badge de mensajes no leídos — oculto para admin del sistema */}
          {usuario.rol !== 'admin' && (
            <Link
              to="/chat"
              className={`${styles.iconBadgeBtn} ${mensajesNL > 0 ? styles.iconBadgeActive : ''}`}
              title={mensajesNL > 0 ? `${mensajesNL} mensaje${mensajesNL !== 1 ? 's' : ''} sin leer` : 'Chat'}
              aria-label="Chat"
              onClick={() => setMobileOpen(false)}
            >
              <span aria-hidden="true">💬</span>
              {mensajesNL > 0 && (
                <span className={styles.iconBadgeCount}>{mensajesNL > 9 ? '9+' : mensajesNL}</span>
              )}
            </Link>
          )}

          {/* Campana de notificaciones — siempre visible; badge solo si hay sin leer */}
          <button
            className={`${styles.notifBadge} ${notifColor}`}
            title={noLeidas > 0 ? `${noLeidas} notificación${noLeidas !== 1 ? 'es' : ''} sin leer` : 'Notificaciones'}
            onClick={() => { setMobileOpen(false); navigate('/notificaciones'); }}
            aria-label="Notificaciones"
          >
            <span aria-hidden="true">🔔</span>{noLeidas > 0 && <> {noLeidas > 9 ? '9+' : noLeidas}</>}
          </button>

          {/* Menú usuario */}
          <div
            ref={menuRef}
            className={styles.userMenu}
            onClick={() => { setMenuOpen(!menuOpen); setMobileOpen(false); }}
            aria-haspopup="true"
            aria-expanded={menuOpen}
          >
            {/* Avatar */}
            <Avatar
              src={usuario.fotoPerfil}
              nombre={usuario.nombre}
              apellido={usuario.apellido}
              size={30}
              style={{ fontSize: '0.82rem', border: '2px solid rgba(255, 255, 255, 0.3)' }}
            />
            <span className={styles.userName}>{usuario.nombre}</span>
            <span className={styles.arrow}>{menuOpen ? '▴' : '▾'}</span>

            {/* Dropdown */}
            {menuOpen && (
              <div className={styles.dropdown}>
                {/* Nombre completo */}
                <span className={styles.dropdownName}>
                  {usuario.nombre} {usuario.apellido}
                </span>
                <span className={styles.dropdownInfo}>{usuario.email}</span>

                {/* Badge de rol */}
                <span className={`${styles.dropdownRole} badge badge-${usuario.rol}`}>
                  {usuario.rol}
                </span>

                {/* Datos adicionales */}
                {usuario.telefono && (
                  <span className={styles.dropdownInfo}>📞 {usuario.telefono}</span>
                )}
                {usuario.ubicacion && (
                  <span className={styles.dropdownInfo}>📍 {usuario.ubicacion}</span>
                )}

                {/* Separador */}
                <div className={styles.dropdownDivider} />

                {/* Notificaciones pendientes con prioridad */}
                {noLeidas > 0 && (
                  <button
                    className={styles.dropdownNotif}
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); navigate('/notificaciones'); }}
                  >
                    🔔 {noLeidas} notificación{noLeidas !== 1 ? 'es' : ''} sin leer
                    {prioridadAlta && <span className={styles.dropdownUrgente}>¡Urgente!</span>}
                  </button>
                )}

                {/* Cerrar sesión */}
                <button onClick={handleLogout} className={styles.dropdownLogout}>
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Panel de navegación móvil ──────────────────────────────────── */}
      {mobileOpen && (
        <div className={styles.navbarMobilePanel} id="nav-mobile">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`${styles.navLink} ${esActivo(l.to) ? styles.active : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
