/**
 * EditarOfertaPage.jsx — Edición del contenido de una oferta existente.
 *
 * Ruta: /empresa/ofertas/:id/editar
 * Acceso: solo el reclutador responsable de la oferta (o cualquier
 * reclutador activo si es una oferta histórica sin creadaPorUsuarioId
 * registrado) — el backend ya lo exige (PUT /api/ofertas/:id, RBAC-01);
 * el guard de acá evita mostrarle un formulario a alguien que solo va a
 * recibir un 403 al guardar. admin_empresa nunca edita contenido (a
 * diferencia de pausar/cerrar, donde sí tiene override institucional).
 *
 * El formulario en sí vive en OfertaForm.jsx (compartido con CrearOfertaPage.jsx).
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ofertaService } from '../../services/api';
import { useEmpresa } from '../../hooks/useEmpresa';
import { useAuth } from '../../hooks/useAuth';
import OfertaForm from './OfertaForm';

function soloFecha(iso) {
  return iso ? String(iso).slice(0, 10) : '';
}

export default function EditarOfertaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { esReclutador, loading: loadingRol } = useEmpresa();
  const { usuario } = useAuth();

  const [oferta,  setOferta]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    ofertaService.getById(id)
      .then(({ data }) => setOferta(data.data ?? data))
      .catch((err) => setError(err.response?.data?.message || 'No se pudo cargar la oferta.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading || loadingRol) {
    return <div className="page-container"><p className="msg">Cargando...</p></div>;
  }

  if (error || !oferta) {
    return (
      <div className="page-container">
        <p className="error-msg">{error || 'Oferta no encontrada.'}</p>
        <Link to="/empresa" className="btn-secondary">← Volver al panel</Link>
      </div>
    );
  }

  const esResponsable = !oferta.creadaPorUsuarioId || oferta.creadaPorUsuarioId === usuario?.id;

  if (!esReclutador || !esResponsable) {
    return (
      <div className="page-container">
        <p className="error-msg">
          {esReclutador
            ? 'Solo el reclutador responsable de esta oferta puede editar su contenido.'
            : 'Los administradores de empresa no editan el contenido de las ofertas.'}
        </p>
        <Link to="/empresa" className="btn-secondary">← Volver al panel</Link>
      </div>
    );
  }

  const handleSubmit = async (payload) => {
    await ofertaService.update(id, payload);
    navigate('/empresa');
  };

  return (
    <OfertaForm
      titulo="Editar Oferta"
      submitLabel="✓ Guardar cambios"
      submitLabelLoading="Guardando..."
      initialForm={{
        titulo:             oferta.titulo ?? '',
        descripcion:        oferta.descripcion ?? '',
        requisitos:         oferta.requisitos ?? '',
        area:               oferta.area ?? '',
        modalidad:          oferta.modalidad ?? 'presencial',
        modalidadExtendida: oferta.modalidadExtendida ?? 'tiempo_completo',
        ciudad:             oferta.ciudad ?? '',
        cantidadVacantes:   oferta.cantidadVacantes ?? 1,
        remuneracion:       oferta.remuneracion ?? '',
        salario:            oferta.salario ?? '',
        beneficios:         oferta.beneficios ?? '',
        fechaPublicacion:   soloFecha(oferta.fechaPublicacion),
        fechaLimite:        soloFecha(oferta.fechaLimite),
        tipoPuesto:          oferta.tipoPuesto ?? 'pasante',
        requiereExperiencia: !!oferta.requiereExperiencia,
        experienciaDetalle:  oferta.experienciaDetalle ?? '',
      }}
      initialCarreras={oferta.carrerasDestinatarias ?? []}
      onSubmit={handleSubmit}
      onCancel={() => navigate('/empresa')}
    />
  );
}
