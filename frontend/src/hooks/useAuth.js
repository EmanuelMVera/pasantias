/**
 * useAuth — hook para acceder al contexto de autenticación (AuthContext).
 *
 * Vive en su propio archivo (y no en AuthContext.jsx) para que ese módulo
 * exporte únicamente componentes y Fast Refresh funcione sin recargar toda la
 * app en cada edición (regla react-refresh/only-export-components).
 *
 * Uso: const { usuario, login, logout, esAdmin } = useAuth()
 */
import { useContext } from 'react';
import AuthContext from '../context/AuthContext';

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
};
