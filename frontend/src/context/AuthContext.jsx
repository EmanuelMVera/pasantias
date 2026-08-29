/**
 * AuthContext.jsx — Contexto global de autenticación.
 *
 * Provee a toda la aplicación React el estado del usuario autenticado
 * y las funciones para iniciar sesión, registrarse y cerrar sesión.
 *
 * Funcionamiento (SEC-02):
 * - La sesión vive en una cookie HttpOnly (el JS no la ve). Al cargar la app se
 *   llama SIEMPRE a /api/auth/me; un 401 significa "sin sesión".
 * - Expone el usuario, el estado de carga y las funciones login/logout
 *
 * Estructura del objeto usuario:
 * {
 *   id, nombre, apellido, email, rol,
 *   telefono, ubicacion, fotoPerfil, ultimoAcceso,
 *   razonSocial (solo empresa)
 * }
 *
 * Roles soportados: alumno | egresado | empresa | admin
 *
 * Uso en componentes: const { usuario, login, logout } = useAuth()
 */

import { createContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/api';

// Crea el contexto. El valor null indica que aún no fue inicializado
const AuthContext = createContext(null);

/**
 * Normaliza el objeto usuario que viene del backend, asegurando que todos los
 * campos opcionales existan (aunque sean null) para evitar errores de undefined.
 * @param {Object} raw - Datos crudos del backend
 * @returns {Object} Usuario normalizado
 */
function normalizarUsuario(raw) {
  if (!raw) return null;
  return {
    id:           raw.id          ?? null,
    nombre:       raw.nombre      ?? '',
    apellido:     raw.apellido    ?? '',
    email:        raw.email       ?? '',
    rol:          raw.rol         ?? 'alumno',
    // Campos extendidos (pueden no existir en versiones anteriores del backend)
    telefono:     raw.telefono    ?? null,
    ubicacion:    raw.ubicacion   ?? null,
    fotoPerfil:   raw.fotoPerfil  ?? null,
    ultimoAcceso: raw.ultimoAcceso ?? null,
    // Campos específicos por rol
    razonSocial:  raw.razonSocial ?? null,
  };
}

/**
 * AuthProvider — Componente que envuelve la app y provee el contexto de autenticación.
 * Debe usarse en el componente raíz (App.jsx o main.jsx).
 */
export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);  // Usuario autenticado (null si no hay sesión)
  const [loading, setLoading] = useState(true);  // Indica si se está verificando la sesión inicial

  // Al montar: preguntar al backend si la cookie de sesión es válida.
  useEffect(() => {
    authService.me()
      .then(({ data }) => setUsuario(normalizarUsuario(data.usuario)))
      .catch(() => setUsuario(null)) // 401 → sin sesión
      .finally(() => setLoading(false));
  }, []);

  /**
   * Inicia sesión con email y contraseña. El backend setea la cookie HttpOnly;
   * acá solo guardamos el usuario en memoria.
   * @returns {Object} Datos del usuario autenticado (normalizados)
   */
  const login = async (email, password) => {
    const { data } = await authService.login({ email, password });
    const normalizado = normalizarUsuario(data.usuario);
    setUsuario(normalizado);
    return normalizado;
  };

  /**
   * Cierra la sesión: el backend borra la cookie, acá limpiamos el estado.
   */
  const logout = async () => {
    try { await authService.logout(); } catch { /* no bloquear el logout local */ }
    setUsuario(null);
  };

  /**
   * Actualiza el estado local del usuario sin necesidad de un nuevo login.
   * Útil cuando el usuario edita su perfil y queremos reflejar los cambios.
   * @param {Object} datosActualizados - Campos a actualizar (merge con el estado actual)
   */
  const actualizarUsuario = useCallback((datosActualizados) => {
    setUsuario((prev) => prev ? normalizarUsuario({ ...prev, ...datosActualizados }) : null);
  }, []);

  /**
   * Helpers de rol para simplificar las comprobaciones en componentes.
   * Ejemplo: if (esAdmin) return <AdminPanel />
   */
  const esAdmin    = usuario?.rol === 'admin';
  const esEmpresa  = usuario?.rol === 'empresa';
  const esAlumno   = usuario?.rol === 'alumno' || usuario?.rol === 'egresado';

  return (
    // Provee el estado y las funciones a todos los componentes hijos
    <AuthContext.Provider value={{
      usuario,
      loading,
      login,
      logout,
      actualizarUsuario,
      // Helpers de rol (evitan repetir usuario?.rol === 'x' en cada componente)
      esAdmin,
      esEmpresa,
      esAlumno,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// El hook de consumo vive en src/hooks/useAuth.js (ver nota de Fast Refresh allí).
export default AuthContext;
