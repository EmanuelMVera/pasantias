/**
 * App.jsx — Componente raíz de la aplicación React.
 *
 * Define la estructura principal del sistema:
 * - Envuelve toda la app con el AuthProvider (contexto de autenticación)
 * - Configura el enrutador (BrowserRouter)
 * - Renderiza el chrome: Navbar (alumno/empresa) o AdminShell (admin)
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
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import { EmpresaProvider } from './context/EmpresaContext';
import { getRutaInicio, ROLES_VALIDOS } from './utils/rutas';


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
import EmpresaInicioPage from './pages/empresa/EmpresaInicioPage';
import OfertasEmpresaPage from './pages/empresa/OfertasEmpresaPage';
import CrearOfertaPage from './pages/empresa/CrearOfertaPage';
import EditarOfertaPage from './pages/empresa/EditarOfertaPage';
import PostulantesMiOfertaPage from './pages/empresa/PostulantesMiOfertaPage';
import EquipoPage from './pages/empresa/EquipoPage';
import SeguridadPage from './pages/empresa/SeguridadPage';
import MiPerfilReclutadorPage from './pages/empresa/MiPerfilReclutadorPage';
import MiEmpresaPage from './pages/empresa/MiEmpresaPage';
import CandidatosEmpresaPage from './pages/empresa/CandidatosEmpresaPage';

// Página del administrador (requiere rol admin)
import AdminDashboardPage  from './pages/admin/AdminDashboardPage';
import AdminUsuariosPage   from './pages/admin/AdminUsuariosPage';
import AdminLogsPage       from './pages/admin/AdminLogsPage';
import AdminSolicitudesPage from './pages/admin/AdminSolicitudesPage';
import AdminOfertasPage    from './pages/admin/AdminOfertasPage';
import AdminEmpresasPage   from './pages/admin/AdminEmpresasPage';
import AdminImportacionPage from './pages/admin/AdminImportacionPage';

// Páginas de perfiles públicos (alumno/egresado y empresa)
import PerfilPublicoPage  from './pages/alumno/PerfilPublicoPage';
import EmpresaPublicaPage from './pages/empresa/EmpresaPublicaPage';
import ReclutadorPerfilPage from './pages/empresa/ReclutadorPerfilPage';

// Página de chat/mensajería (todos los roles autenticados)
import ChatPage from './pages/ChatPage';

// Página de notificaciones (todos los roles autenticados)
import NotificacionesPage from './pages/NotificacionesPage';

// Componentes de layout global que se muestran en todas las páginas
import Navbar from './components/Navbar/Navbar';
import AdminShell from './components/AdminShell/AdminShell';
import EmpresaShell from './components/EmpresaShell/EmpresaShell';
import ReclutadorNav from './components/ReclutadorNav/ReclutadorNav';
import { useEmpresa } from './hooks/useEmpresa';

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
  if (loading) return <div className="app-loading">Cargando...</div>;

  // Sin sesión → redirige al inicio
  if (!usuario) return <Navigate to={redirectTo} replace />;

  // Si se especifican roles y el usuario no tiene uno válido → redirige
  if (roles && roles.length > 0 && !roles.includes(usuario.rol)) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
};

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
  const { usuario, loading, logout } = useAuth();

  // Mientras se resuelve la sesión inicial no se renderiza ninguna ruta: evita
  // el flash de HomePage/Login a un usuario ya autenticado (y que un componente
  // con fetch en el mount dispare un 401 en la ventana del sondeo).
  if (loading) return <div className="app-loading">Cargando...</div>;

  // Sesión con un rol que no reconocemos: no hay home válida → cortar el posible
  // loop de redirección y ofrecer cerrar sesión.
  const rolInvalido = usuario && !ROLES_VALIDOS.includes(usuario.rol);
  if (rolInvalido) return (
    <div className="app-loading">
      <p>Tu cuenta no tiene un rol válido para acceder al sistema.</p>
      <button className="btn-primary" onClick={() => logout()}>Cerrar sesión</button>
    </div>
  );

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
      {/* /empresa: Resumen (administrador de empresa) o panel operativo (reclutador) */}
      <Route path="/empresa" element={
        <ProtectedRoute roles={['empresa']}>
          <EmpresaInicioPage />
        </ProtectedRoute>
      } />
      {/* Ofertas: vista corporativa (admin_empresa) o "Mis ofertas" (reclutador). Va antes de /empresa/:empresaId. */}
      <Route path="/empresa/ofertas" element={
        <ProtectedRoute roles={['empresa']}>
          <OfertasEmpresaPage />
        </ProtectedRoute>
      } />
      {/* Crear y editar ofertas es exclusivo del reclutador (guard de rol interno). */}
      <Route path="/empresa/nueva-oferta" element={
        <ProtectedRoute roles={['empresa']}>
          <SoloReclutador><CrearOfertaPage /></SoloReclutador>
        </ProtectedRoute>
      } />
      <Route path="/empresa/ofertas/:id/editar" element={
        <ProtectedRoute roles={['empresa']}>
          <SoloReclutador><EditarOfertaPage /></SoloReclutador>
        </ProtectedRoute>
      } />
      <Route path="/empresa/postulantes/:ofertaId" element={
        <ProtectedRoute roles={['empresa']}>
          <PostulantesMiOfertaPage />
        </ProtectedRoute>
      } />
      {/* Equipo es gobierno del administrador de empresa: el reclutador no tiene esta sección. */}
      <Route path="/empresa/equipo" element={
        <ProtectedRoute roles={['empresa']}>
          <SoloAdminEmpresa><EquipoPage /></SoloAdminEmpresa>
        </ProtectedRoute>
      } />
      {/* Mi perfil: datos personales del reclutador (el admin_empresa usa Mi empresa). */}
      <Route path="/empresa/mi-perfil" element={
        <ProtectedRoute roles={['empresa']}>
          <SoloReclutador><MiPerfilReclutadorPage /></SoloReclutador>
        </ProtectedRoute>
      } />
      <Route path="/empresa/seguridad" element={
        <ProtectedRoute roles={['empresa']}>
          <SeguridadPage />
        </ProtectedRoute>
      } />
      {/* Mi empresa es del administrador de empresa; el reclutador va al perfil público. */}
      <Route path="/empresa/mi-empresa" element={
        <ProtectedRoute roles={['empresa']}>
          <MiEmpresaPorRol />
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
      <Route path="/admin/empresas" element={
        <ProtectedRoute roles={['admin']}>
          <AdminEmpresasPage />
        </ProtectedRoute>
      } />
      <Route path="/admin/ofertas" element={
        <ProtectedRoute roles={['admin']}>
          <AdminOfertasPage />
        </ProtectedRoute>
      } />
      <Route path="/admin/importaciones" element={
        <ProtectedRoute roles={['admin']}>
          <AdminImportacionPage />
        </ProtectedRoute>
      } />

      {/* ── Perfiles públicos (alumno/egresado, empresa) ── */}
      {/* /perfil/:usuarioId — vista pública de un alumno o egresado */}
      <Route path="/perfil/:usuarioId" element={
        <ProtectedRoute roles={['alumno', 'egresado', 'empresa', 'admin']}>
          <PerfilPublicoPage />
        </ProtectedRoute>
      } />
      {/* /reclutador/:usuarioId — ficha de un reclutador (el backend decide quién puede verla) */}
      <Route path="/reclutador/:usuarioId" element={
        <ProtectedRoute roles={['alumno', 'egresado', 'empresa', 'admin']}>
          <ReclutadorPerfilPage />
        </ProtectedRoute>
      } />
      {/* /empresa/:empresaId — vista pública de una empresa (DESPUÉS de todas las rutas fijas /empresa/...) */}
      <Route path="/empresa/:empresaId" element={
        <ProtectedRoute roles={['alumno', 'egresado', 'empresa', 'admin']}>
          <EmpresaPublicaPage />
        </ProtectedRoute>
      } />

      {/* Ruta fallback: cualquier URL no reconocida redirige al inicio */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/**
 * SoloReclutador — guard de ROL INTERNO para rutas operativas (crear/editar
 * ofertas). ProtectedRoute solo conoce el rol global `empresa`; acá se
 * distingue reclutador de admin_empresa para no mostrarle un formulario a quien
 * el backend le va a responder 403. Es UX: la autoridad sigue siendo el backend.
 */
function SoloReclutador({ children }) {
  const { esReclutador, loading } = useEmpresa();
  if (loading) return <div className="app-loading" role="status">Cargando...</div>;
  return esReclutador ? children : <Navigate to="/empresa" replace />;
}

/**
 * SoloAdminEmpresa — guard de ROL INTERNO para pantallas de gobierno (Equipo).
 * El reclutador es un workspace operativo personal: no administra integrantes,
 * así que se lo devuelve a su inicio. Es UX: el backend sigue exigiendo
 * admin_empresa en cada acción de gestión del equipo.
 */
function SoloAdminEmpresa({ children }) {
  const { esAdminEmpresa, loading } = useEmpresa();
  if (loading) return <div className="app-loading" role="status">Cargando...</div>;
  return esAdminEmpresa ? children : <Navigate to="/empresa" replace />;
}

/**
 * /empresa/mi-empresa: pantalla de gobierno del administrador de empresa. El
 * reclutador solo consulta la empresa → se lo lleva al perfil público, que es
 * lo que ve un alumno.
 */
function MiEmpresaPorRol() {
  const { empresa, esReclutador, loading } = useEmpresa();
  if (loading) return <div className="app-loading" role="status">Cargando...</div>;
  if (esReclutador && empresa?.id) return <Navigate to={`/empresa/${empresa.id}`} replace />;
  return <MiEmpresaPage />;
}

/**
 * Chrome — Estructura visual común.
 *
 * Cuatro experiencias autenticadas distintas:
 * - Rol admin (Administrador del Sistema): AdminShell (sidebar + topbar).
 * - Rol empresa con rolInterno admin_empresa (Administrador de Empresa):
 *   EmpresaShell — mismo lenguaje visual, secciones de gobierno de la empresa.
 * - Rol empresa con rolInterno reclutador: ReclutadorNav — barra horizontal
 *   propia (workspace operativo, sin sidebar).
 * - Alumno/egresado y páginas públicas: Navbar.
 *
 * El rol interno de un usuario empresa llega asíncrono (EmpresaContext): hasta
 * que se resuelve no se dibuja ningún chrome, para no mostrarle por un instante
 * el navbar a un administrador de empresa (ni el shell a un reclutador).
 */
function Chrome() {
  const { usuario } = useAuth();
  const { esAdminEmpresa, esReclutador, loading: cargandoEmpresa } = useEmpresa();

  if (usuario?.rol === 'admin') {
    return (
      <>
        <a href="#contenido" className="skip-link">Saltar al contenido</a>
        <AdminShell>
          <main id="contenido">
            <AppRoutes />
          </main>
        </AdminShell>
      </>
    );
  }

  if (usuario?.rol === 'empresa' && cargandoEmpresa) {
    return <div className="app-loading" role="status">Cargando...</div>;
  }

  if (esAdminEmpresa) {
    return (
      <>
        <a href="#contenido" className="skip-link">Saltar al contenido</a>
        <EmpresaShell>
          <main id="contenido">
            <AppRoutes />
          </main>
        </EmpresaShell>
      </>
    );
  }

  return (
    <>
      <a href="#contenido" className="skip-link">Saltar al contenido</a>
      {esReclutador ? <ReclutadorNav /> : <Navbar />}
      <main id="contenido">
        <AppRoutes />
      </main>
    </>
  );
}

/**
 * App — Componente principal que estructura la aplicación.
 * Provee el contexto de autenticación y el router a toda la app.
 */
export default function App() {
  return (
    <AuthProvider>
      <EmpresaProvider>
        <BrowserRouter>
          <Chrome />
        </BrowserRouter>
      </EmpresaProvider>
    </AuthProvider>
  );
}
