/**
 * useEmpresa — hook para acceder al contexto de empresa / rol interno.
 *
 * Vive en su propio archivo (y no en EmpresaContext.jsx) para que ese módulo
 * exporte únicamente componentes y Fast Refresh funcione sin recargar toda la
 * app en cada edición (regla react-refresh/only-export-components).
 *
 * Uso: const { empresa, rolInterno, esAdminEmpresa, esReclutador } = useEmpresa()
 */
import { useContext } from 'react';
import EmpresaContext from '../context/EmpresaContext';

export const useEmpresa = () => {
  const ctx = useContext(EmpresaContext);
  if (!ctx) throw new Error('useEmpresa debe usarse dentro de EmpresaProvider');
  return ctx;
};
