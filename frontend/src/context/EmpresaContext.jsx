/**
 * EmpresaContext.jsx — Contexto liviano de rol interno y empresa actual (FE-05).
 *
 * Antes: EquipoPage, EmpresaDashboardPage y MiEmpresaPage resolvían
 * `admin_empresa` vs `reclutador` cada una por su cuenta, con su propio
 * useState + useEffect. MiEmpresaPage llegaba a pedir el dashboard completo
 * (GET /empresas/dashboard) solo para leer un campo y descartar el resto.
 *
 * Este context NO reemplaza a AuthContext (que solo conoce usuario.rol de
 * sistema) ni es una fuente de autorización real — authorizeEmpresaRoles en
 * el backend sigue siendo la única autoridad de permisos. Es puramente
 * informativo para decisiones de UI (qué botón mostrar, qué texto usar).
 *
 * Se resuelve UNA vez por sesión (cuando cambia usuario.id/usuario.rol), no
 * en cada navegación entre páginas de empresa — reutiliza GET /empresas/mi-empresa,
 * que ya incluía la fila de Empresa y ahora también expone `rolEnEquipo`
 * (mismo campo que ya devolvían getDashboard/getEquipo).
 *
 * Uso: const { empresa, rolInterno, esAdminEmpresa, esReclutador } = useEmpresa()
 */

import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { empresaService } from '../services/api';

const EmpresaContext = createContext(null);

export const EmpresaProvider = ({ children }) => {
  const { usuario } = useAuth();
  const [empresa, setEmpresa]       = useState(null);
  const [rolInterno, setRolInterno] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  useEffect(() => {
    if (!usuario || usuario.rol !== 'empresa') {
      setEmpresa(null);
      setRolInterno(null);
      setError(null);
      return;
    }

    let cancelado = false;
    setLoading(true);
    setError(null);

    empresaService.getMiEmpresa()
      .then(({ data }) => {
        if (cancelado) return;
        setEmpresa(data.data ?? null);
        setRolInterno(data.rolEnEquipo ?? null);
      })
      .catch((err) => {
        if (cancelado) return;
        setError(err.response?.data?.message ?? 'No se pudo resolver la empresa.');
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    return () => { cancelado = true; };
  }, [usuario?.id, usuario?.rol]);

  const value = {
    empresa,
    rolInterno,
    esAdminEmpresa: rolInterno === 'admin_empresa',
    esReclutador:   rolInterno === 'reclutador',
    loading,
    error,
  };

  return <EmpresaContext.Provider value={value}>{children}</EmpresaContext.Provider>;
};

/**
 * Hook para acceder al contexto de empresa/rol interno.
 * Lanza un error si se usa fuera de un EmpresaProvider.
 *
 * Uso: const { rolInterno, esAdminEmpresa, esReclutador } = useEmpresa()
 */
export const useEmpresa = () => {
  const ctx = useContext(EmpresaContext);
  if (!ctx) throw new Error('useEmpresa debe usarse dentro de EmpresaProvider');
  return ctx;
};

export default EmpresaContext;
