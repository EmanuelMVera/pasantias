/**
 * CrearOfertaPage.jsx — Publicar una nueva oferta laboral.
 *
 * Ruta: /empresa/nueva-oferta
 * Acceso: solo reclutador (RBAC-01) — el backend ya lo exige
 * (POST /api/ofertas); el guard de acá evita que un admin_empresa complete
 * todo el formulario para recién enterarse del 403 al guardar (no hay botón
 * visible a "+ Nueva Oferta" para admin_empresa, pero la ruta es accesible
 * por URL directa).
 *
 * El formulario en sí vive en OfertaForm.jsx (compartido con EditarOfertaPage.jsx).
 */

import { Link, useNavigate } from 'react-router-dom';
import { ofertaService } from '../../services/api';
import { useEmpresa } from '../../hooks/useEmpresa';
import OfertaForm from './OfertaForm';

export default function CrearOfertaPage() {
  const navigate = useNavigate();
  const { esAdminEmpresa, loading: loadingRol } = useEmpresa();

  if (loadingRol) {
    return <div className="page-container"><p className="msg">Cargando...</p></div>;
  }

  if (esAdminEmpresa) {
    return (
      <div className="page-container">
        <p className="error-msg">
          Los administradores de empresa no crean ofertas — esa acción corresponde al equipo de
          reclutamiento.
        </p>
        <Link to="/empresa" className="btn-secondary">← Volver al panel</Link>
      </div>
    );
  }

  const handleSubmit = async (payload) => {
    await ofertaService.create(payload);
    navigate('/empresa');
  };

  return (
    <OfertaForm
      titulo="Publicar Nueva Oferta"
      submitLabel="✓ Publicar Oferta"
      submitLabelLoading="Publicando..."
      onSubmit={handleSubmit}
      onCancel={() => navigate('/empresa')}
    />
  );
}
