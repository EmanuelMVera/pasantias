/**
 * CrearOfertaPage.jsx — Publicar una nueva oferta laboral.
 *
 * Ruta: /empresa/nueva-oferta
 * Acceso: solo reclutador — lo exige el backend (POST /api/ofertas) y el guard
 * de rol interno de la ruta (`SoloReclutador` en App.jsx) redirige al
 * administrador de empresa a su inicio. La oferta queda a cargo de quien la crea.
 *
 * El formulario en sí vive en OfertaForm.jsx (compartido con EditarOfertaPage.jsx).
 */

import { useNavigate } from 'react-router-dom';
import { ofertaService } from '../../services/oferta.service';
import OfertaForm from './OfertaForm';

export default function CrearOfertaPage() {
  const navigate = useNavigate();

  const handleSubmit = async (payload) => {
    await ofertaService.create(payload);
    navigate('/empresa/ofertas');
  };

  return (
    <OfertaForm
      titulo="Nueva oferta"
      subtitulo="Completá los datos de la búsqueda. Vas a quedar como responsable de la oferta."
      submitLabel="Publicar oferta"
      submitLabelLoading="Publicando..."
      onSubmit={handleSubmit}
      onCancel={() => navigate('/empresa/ofertas')}
    />
  );
}
