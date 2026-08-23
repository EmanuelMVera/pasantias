/**
 * App.jsx — Componente raíz de la aplicación React.
 *
 * Define la estructura principal del sistema:
 * - Envuelve toda la app con el AuthProvider (contexto de autenticación)
 * - Configura el enrutador (BrowserRouter)
 * - Renderiza el TopBanner (logo institucional) y el Navbar (navegación)
 * - Define todas las rutas de la aplicación y sus protecciones de acceso
 *
 * Tipos de rutas:
 * - Públicas: accesibles sin iniciar sesión (home, login, registro de empresa)
 * - Protegidas: requieren autenticación, con control de roles
 *
 * Roles soportados y redirección raíz:
 * - admin   → /admin
 * - empresa → /empresa
 * - alumno  → /dashboard  (también egresado)
 * - egresado → /dashboard
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';


// Páginas públicas (accesibles sin login)
import HomePage from './pages/HomePage';
import LoginPage from './pages/auth/LoginPage';
import SolicitudEmpresaPage from './pages/auth/SolicitudEmpresaPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';

// Páginas del alumno/egresado (requieren rol alumno o egresado)
import AlumnoDashboardPage from './pages/alumno/AlumnoDashboardPage';
import OfertasPage from './pages/alumno/OfertasPage';
import OfertaDetallePage from './pages/alumno/OfertaDetallePage';
import MisPostulacionesPage from './pages/alumno/MisPostulacionesPage';
import PerfilPage from './pages/alumno/PerfilPage';

// Páginas de la empresa (requieren rol empresa)
import EmpresaDashboardPage from './pages/empresa/EmpresaDashboardPage';
import CrearOfertaPage from './pages/empresa/CrearOfertaPage';
import PostulantesMiOfertaPage from './pages/empresa/PostulantesMiOfertaPage';
import EquipoPage from './pages/empresa/EquipoPage';
import SeguridadPage from './pages/empresa/SeguridadPage';
import MiEmpresaPage from './pages/empresa/MiEmpresaPage';
import CandidatosEmpresaPage from './pages/empresa/CandidatosEmpresaPage';

// Página del administrador (requiere rol admin)
import AdminDashboardPage  from './pages/admin/AdminDashboardPage';
import AdminUsuariosPage   from './pages/admin/AdminUsuariosPage';
import AdminLogsPage       from './pages/admin/AdminLogsPage';
import AdminSolicitudesPage from './pages/admin/AdminSolicitudesPage';
import AdminOfertasPage    from './pages/admin/AdminOfertasPage';

// Páginas de perfiles públicos (alumno/egresado y empresa)
import PerfilPublicoPage  from './pages/alumno/PerfilPublicoPage';
import EmpresaPublicaPage from './pages/empresa/EmpresaPublicaPage';

// Página de chat/mensajería (todos los roles autenticados)
import ChatPage from './pages/ChatPage';

// Página de notificaciones (todos los roles autenticados)
import NotificacionesPage from './pages/NotificacionesPage';

// Componentes de layout global que se muestran en todas las páginas
import Navbar from './components/Navbar/Navbar';
import TopBanner from './components/TopBanner/TopBanner';

/**
 * ProtectedRoute — Componente de guardia de rutas.
 *
 * Verifica que el usuario esté autenticado y tenga uno de los roles requeridos.
 * - Si está cargando la sesión: muestra un mensaje de espera
 * - Si no está autenticado: redirige al inicio (/)
 * - Si no tiene el rol correcto: redirige al inicio (/)
 * - Si todo está bien: renderiza el componente hijo
 *
 * @param {React.ReactNode} children - Componente de la página protegida
 * @param {string[]} roles - Array de roles permitidos. Ej: ['admin', 'empresa']
 *                           Si se omite, cualquier usuario autenticado puede acceder.
 * @param {string} redirectTo - Ruta de redirección si no tiene acceso (por defecto '/')
 */
const ProtectedRoute = ({ children, roles, redirectTo = '/' }) => {
  const { usuario, loading } = useAuth();

  // Esperar a que se resuelva la sesión inicial
  if (loading) return (
    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
      Cargando...
    </div>
  );

  // Sin sesión → redirige al inicio
  if (!usuario) return <Navigate to={redirectTo} replace />;

  // Si se especifican roles y el usuario no tiene uno válido → redirige
  if (roles && roles.length > 0 && !roles.includes(usuario.rol)) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
};

/**
 * Obtiene la ruta de inicio según el rol del usuario.
 * Centraliza la lógica de redirección post-login.
 * @param {string} rol - Rol del usuario autenticado
 * @returns {string} Ruta de redirección
 */
function getRutaInicio(rol) {
  switch (rol) {
    case 'admin':    return '/admin';
    case 'empresa':  return '/empresa';
    case 'alumno':
    case 'egresado':
    default:         return '/dashboard';
  }
}

/**
 * AppRoutes — Define todas las rutas de la aplicación.
 *
 * La ruta raíz "/" redirige automáticamente según el rol del usuario:
 * - Sin sesión → HomePage (landing pública)
 * - admin   → /admin
 * - empresa → /empresa
 * - alumno/egresado → /dashboard
 */
function AppRoutes() {
  const { usuario } = useAuth();

  return (
    <Routes>
      {/* Redirección inteligente según el rol del usuario */}
      <Route path="/" element={
        !usuario
          ? <HomePage />
          : <Navigate to={getRutaInicio(usuario.rol)} replace />
      } />

      {/* ── Rutas públicas (solo para usuarios no autenticados) ── */}
      <Route path="/login"    element={!usuario ? <LoginPage />    : <Navigate to={getRutaInicio(usuario.rol)} replace />} />
      <Route path="/registro-empresa" element={!usuario ? <SolicitudEmpresaPage /> : <Navigate to={getRutaInicio(usuario.rol)} replace />} />
      <Route path="/forgot-password"        element={<ForgotPasswordPage />} />
      <Route path="/reset-password/:token"  element={<ResetPasswordPage />} />

      {/* ── Rutas del alumno/egresado ── */}
      {/* /dashboard es el panel principal del alumno/egresado */}
      <Route path="/dashboard" element={
        <ProtectedRoute roles={['alumno', 'egresado']}>
          <AlumnoDashboardPage />
        </ProtectedRoute>
      } />
      <Route path="/ofertas" element={
        <ProtectedRoute roles={['alumno', 'egresado']}>
          <OfertasPage />
        </ProtectedRoute>
      } />
      <Route path="/ofertas/:id" element={
        <ProtectedRoute roles={['alumno', 'egresado']}>
          <OfertaDetallePage />
        </ProtectedRoute>
      } />
      <Route path="/mis-postulaciones" element={
        <ProtectedRoute roles={['alumno', 'egresado']}>
          <MisPostulacionesPage />
        </ProtectedRoute>
      } />
      <Route path="/perfil" element={
        <ProtectedRoute roles={['alumno', 'egresado']}>
          <PerfilPage />
        </ProtectedRoute>
      } />

      {/* ── Rutas de la empresa ── */}
      <Route path="/empresa" element={
        <ProtectedRoute roles={['empresa']}>
          <EmpresaDashboardPage />
        </ProtectedRoute>
      } />
      <Route path="/empresa/nueva-oferta" element={
        <ProtectedRoute roles={['empresa']}>
          <CrearOfertaPage />
        </ProtectedRoute>
      } />
      <Route path="/empresa/postulantes/:ofertaId" element={
        <ProtectedRoute roles={['empresa']}>
          <PostulantesMiOfertaPage />
        </ProtectedRoute>
      } />
      <Route path="/empresa/equipo" element={
        <ProtectedRoute roles={['empresa']}>
          <EquipoPage />
        </ProtectedRoute>
      } />
      <Route path="/empresa/seguridad" element={
        <ProtectedRoute roles={['empresa']}>
          <SeguridadPage />
        </ProtectedRoute>
      } />
      <Route path="/empresa/mi-empresa" element={
        <ProtectedRoute roles={['empresa']}>
          <MiEmpresaPage />
        </ProtectedRoute>
      } />
      <Route path="/empresa/candidatos" element={
        <ProtectedRoute roles={['empresa']}>
          <CandidatosEmpresaPage />
        </ProtectedRoute>
      } />

      {/* ── Chat / Mensajería (alumno, egresado y empresa) ── */}
      <Route path="/chat" element={
        <ProtectedRoute roles={['alumno', 'egresado', 'empresa']}>
          <ChatPage />
        </ProtectedRoute>
      } />
      <Route path="/chat/:usuarioId" element={
        <ProtectedRoute roles={['alumno', 'egresado', 'empresa']}>
          <ChatPage />
        </ProtectedRoute>
      } />

      {/* ── Notificaciones (todos los roles autenticados) ── */}
      <Route path="/notificaciones" element={
        <ProtectedRoute roles={['alumno', 'egresado', 'empresa', 'admin']}>
          <NotificacionesPage />
        </ProtectedRoute>
      } />

      {/* ── Rutas del administrador ── */}
      <Route path="/admin" element={
        <ProtectedRoute roles={['admin']}>
          <AdminDashboardPage />
        </ProtectedRoute>
      } />
      <Route path="/admin/usuarios" element={
        <ProtectedRoute roles={['admin']}>
          <AdminUsuariosPage />
        </ProtectedRoute>
      } />
      <Route path="/admin/logs" element={
        <ProtectedRoute roles={['admin']}>
          <AdminLogsPage />
        </ProtectedRoute>
      } />
      <Route path="/admin/solicitudes" element={
        <ProtectedRoute roles={['admin']}>
          <AdminSolicitudesPage />
        </ProtectedRoute>
      } />
      <Route path="/admin/ofertas" element={
        <ProtectedRoute roles={['admin']}>
          <AdminOfertasPage />
        </ProtectedRoute>
      } />

      {/* ── Perfiles públicos (alumno/egresado, empresa) ── */}
      {/* /perfil/:usuarioId — vista pública de un alumno o egresado */}
      <Route path="/perfil/:usuarioId" element={
        <ProtectedRoute roles={['alumno', 'egresado', 'empresa']}>
          <PerfilPublicoPage />
        </ProtectedRoute>
      } />
      {/* /empresa/:empresaId — vista pública de una empresa (DESPUÉS de todas las rutas fijas /empresa/...) */}
      <Route path="/empresa/:empresaId" element={
        <ProtectedRoute roles={['alumno', 'egresado', 'empresa']}>
          <EmpresaPublicaPage />
        </ProtectedRoute>
      } />

      {/* Ruta fallback: cualquier URL no reconocida redirige al inicio */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/**
 * App — Componente principal que estructura la aplicación.
 * Provee el contexto de autenticación y el router a toda la app.
 */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <TopBanner />  {/* Banner institucional con logo (siempre visible) */}
        <Navbar />     {/* Barra de navegación (se oculta si no hay sesión) */}
        <AppRoutes />  {/* Sistema de rutas */}
      </BrowserRouter>
    </AuthProvider>
  );
}
