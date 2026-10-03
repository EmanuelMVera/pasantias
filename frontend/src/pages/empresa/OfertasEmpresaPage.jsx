/**
 * OfertasEmpresaPage.jsx — /empresa/ofertas: misma ruta, dos vistas según el
 * rol interno.
 *
 *   - Administrador de empresa → EmpresaOfertasPage (supervisión de TODAS las
 *     ofertas de la empresa, con responsable y asignación).
 *   - Reclutador               → MisOfertasPage (solo las ofertas a su cargo).
 *
 * Es solo presentación: el alcance real lo impone el backend en
 * GET /api/empresas/mis-ofertas.
 */

import { useEmpresa } from '../../hooks/useEmpresa';
import EmpresaOfertasPage from './EmpresaOfertasPage';
import MisOfertasPage from './MisOfertasPage';

export default function OfertasEmpresaPage() {
  const { esAdminEmpresa, loading } = useEmpresa();
  if (loading) return <div className="app-loading" role="status">Cargando...</div>;
  return esAdminEmpresa ? <EmpresaOfertasPage /> : <MisOfertasPage />;
}
