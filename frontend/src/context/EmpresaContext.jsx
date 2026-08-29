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

import { createContext, useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { empresaService } from '../services/api';

const EmpresaContext = createContext(null);

export const EmpresaProvider = ({ children }) => {
  const { usuario } = useAuth();
  const esEmpresa = usuario?.rol === 'empresa';

  const [empresa, setEmpresa]       = useState(null);
  const [rolInterno, setRolInterno] = useState(null);
  // Arranca en true: mientras `usuario` no esté resuelto el valor se enmascara
  // abajo (`esEmpresa && loading`), y para un usuario empresa el primer render
  // ya refleja "cargando" sin necesidad de un setState síncrono en el effect.
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  useEffect(() => {
    // Si el usuario no es de tipo empresa no hay nada que resolver; el estado
    // "vacío" se deriva abajo en `value` (no hace falta setState acá).
    if (!esEmpresa) return;

    let cancelado = false;

    empresaService.getMiEmpresa()
      .then(({ data }) => {
        if (cancelado) return;
        setEmpresa(data.data ?? null);
        setRolInterno(data.rolEnEquipo ?? null);
        setError(null);
      })
      .catch((err) => {
        if (cancelado) return;
        setError(err.response?.data?.message ?? 'No se pudo resolver la empresa.');
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    return () => { cancelado = true; };
  }, [usuario?.id, esEmpresa]);

  // Estado derivado: si el usuario no es empresa, el contexto expone valores
  // vacíos aunque queden restos de una sesión anterior en el state.
  const value = {
    empresa:        esEmpresa ? empresa : null,
    rolInterno:     esEmpresa ? rolInterno : null,
    esAdminEmpresa: esEmpresa && rolInterno === 'admin_empresa',
    esReclutador:   esEmpresa && rolInterno === 'reclutador',
    loading:        esEmpresa && loading,
    error:          esEmpresa ? error : null,
  };

  return <EmpresaContext.Provider value={value}>{children}</EmpresaContext.Provider>;
};

// El hook de consumo vive en src/hooks/useEmpresa.js (ver nota de Fast Refresh allí).
export default EmpresaContext;
