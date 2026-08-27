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
import { useAuth } from '../../context/AuthContext';
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
  const menuRef = useRef(null);

  /* ── Recargar contadores al cambiar de ruta ──────────────────────────── */
  useEffect(() => {
    if (!usuario) return;

    // Notificaciones
    notificacionService.getAll()
      .then(({ data }) => {
        const lista = data.data ?? data ?? [];
        const sinLeer = lista.filter((n) => !n.leida);
        setNoLeidas(sinLeer.length);
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

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
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
    // Exact match primero
    if (location.pathname === to) return true;
    // Solo usar startsWith para rutas con parámetros dinámicos (contienen ':')
    // Ej: /empresa/postulantes/:ofertaId — el link es /empresa/postulantes
    if (to.endsWith('/:') || to.includes('/:')) return location.pathname.startsWith(to.split('/:')[0]);
    return false;
  };


  /* ── Color del badge de notificaciones según prioridad ───────────────── */
  const notifColor = prioridadAlta
    ? styles.notifBadgeAlta
    : noLeidas > 0
      ? styles.notifBadgeNormal
      : '';

  return (
    <nav className={styles.navbar}>
      <div className={styles.navbarInner}>

        {/* Logo */}
        <Link to="/" className={styles.navbarBrand}>
          <span className={styles.brandIcon}>🎓</span>
          <span>SisPasantías</span>
        </Link>

        {/* Links de navegación */}
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

          {/* Badge de mensajes no leídos — oculto para admin del sistema */}
          {usuario.rol !== 'admin' && (
            <Link
              to="/chat"
              className={`${styles.iconBadgeBtn} ${mensajesNL > 0 ? styles.iconBadgeActive : ''}`}
              title={mensajesNL > 0 ? `${mensajesNL} mensaje${mensajesNL !== 1 ? 's' : ''} sin leer` : 'Chat'}
              aria-label="Chat"
            >
              💬
              {mensajesNL > 0 && (
                <span className={styles.iconBadgeCount}>{mensajesNL > 9 ? '9+' : mensajesNL}</span>
              )}
            </Link>
          )}

          {/* Campana de notificaciones — siempre visible; badge solo si hay sin leer */}
          <button
            className={`${styles.notifBadge} ${notifColor}`}
            title={noLeidas > 0 ? `${noLeidas} notificación${noLeidas !== 1 ? 'es' : ''} sin leer` : 'Notificaciones'}
            onClick={() => navigate('/notificaciones')}
            aria-label="Notificaciones"
          >
            🔔{noLeidas > 0 && <> {noLeidas > 9 ? '9+' : noLeidas}</>}
          </button>

          {/* Menú usuario */}
          <div
            ref={menuRef}
            className={styles.userMenu}
            onClick={() => setMenuOpen(!menuOpen)}
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
    </nav>
  );
}
