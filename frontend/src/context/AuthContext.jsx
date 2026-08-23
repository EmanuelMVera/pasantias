/**
 * AuthContext.jsx — Contexto global de autenticación.
 *
 * Provee a toda la aplicación React el estado del usuario autenticado
 * y las funciones para iniciar sesión, registrarse y cerrar sesión.
 *
 * Funcionamiento:
 * - Al cargar la app, intenta recuperar la sesión guardada en localStorage
 * - Si hay un token válido, llama a /api/auth/me para obtener el usuario
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

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

  // Al montar el componente, verifica si hay una sesión activa guardada
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // Si hay token, consulta la API para obtener los datos del usuario
      authService.me()
        .then(({ data }) => setUsuario(normalizarUsuario(data.usuario)))
        .catch(() => localStorage.removeItem('token')) // Token inválido → limpia el storage
        .finally(() => setLoading(false));
    } else {
      setLoading(false); // No hay token → no hay sesión activa
    }
  }, []);

  /**
   * Inicia sesión con email y contraseña.
   * Guarda el token en localStorage y actualiza el estado del usuario.
   * @returns {Object} Datos del usuario autenticado (normalizados)
   */
  const login = async (email, password) => {
    const { data } = await authService.login({ email, password });
    localStorage.setItem('token', data.token);
    const normalizado = normalizarUsuario(data.usuario);
    setUsuario(normalizado);
    return normalizado;
  };

  /**
   * Cierra la sesión del usuario actual.
   * Elimina el token del localStorage y limpia el estado.
   */
  const logout = () => {
    localStorage.removeItem('token');
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

/**
 * Hook personalizado para acceder al contexto de autenticación.
 * Lanza un error si se usa fuera de un AuthProvider.
 *
 * Uso: const { usuario, esAdmin } = useAuth()
 */
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
};

export default AuthContext;
