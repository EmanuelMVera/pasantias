/**
 * EmpresaInicioPage.jsx — inicio del área de empresa (/empresa).
 *
 * Misma ruta, dos experiencias según el rol interno:
 *   - Administrador de empresa → Resumen de empresa (supervisión/gobierno).
 *   - Reclutador               → Mi espacio de reclutamiento (trabajo operativo personal).
 *
 * El rol interno viene de EmpresaContext y es solo de presentación: qué puede
 * hacer cada uno lo decide el backend.
 */

import { useEmpresa } from '../../hooks/useEmpresa';
import EmpresaResumenPage from './EmpresaResumenPage';
import ReclutadorInicioPage from './ReclutadorInicioPage';

export default function EmpresaInicioPage() {
  const { esAdminEmpresa, loading } = useEmpresa();

  if (loading) return <div className="app-loading" role="status">Cargando...</div>;
  return esAdminEmpresa ? <EmpresaResumenPage /> : <ReclutadorInicioPage />;
}
