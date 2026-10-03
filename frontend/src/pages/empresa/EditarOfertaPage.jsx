/**
 * EditarOfertaPage.jsx — Edición del contenido de una oferta existente.
 *
 * Ruta: /empresa/ofertas/:id/editar
 * Acceso: solo el reclutador RESPONSABLE de la oferta. Lo exige el backend
 * (PUT /api/ofertas/:id) y lo anticipan dos guards de UX: `SoloReclutador` en
 * App.jsx (el administrador de empresa nunca edita contenido) y el propio
 * detalle, que para un reclutador solo existe si la oferta está a su cargo.
 *
 * Carga la oferta con GET /api/empresas/ofertas/:id (cualquier estado): el
 * detalle público solo devuelve ofertas visibles para alumnos, y acá hace
 * falta poder abrir una pendiente, rechazada, pausada o cerrada.
 *
 * Guardar cambios en una oferta RECHAZADA la reenvía a revisión del instituto.
 *
 * El formulario en sí vive en OfertaForm.jsx (compartido con CrearOfertaPage.jsx).
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { empresaService } from '../../services/empresa.service';
import { ofertaService } from '../../services/oferta.service';
import EmptyState from '../../components/ui/EmptyState';
import Icon from '../../components/ui/Icon';
import OfertaForm from './OfertaForm';
import styles from './CrearOfertaPage.module.css';

function soloFecha(iso) {
  return iso ? String(iso).slice(0, 10) : '';
}

export default function EditarOfertaPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [oferta,  setOferta]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    let vigente = true;
    empresaService.getOferta(id)
      .then(({ data }) => { if (vigente) setOferta(data.data ?? data); })
      .catch((err) => {
        if (!vigente) return;
        setError(err.response?.status === 404
          ? 'No encontramos esa oferta entre las que tenés a cargo.'
          : (err.response?.data?.message || 'No se pudo cargar la oferta.'));
      })
      .finally(() => { if (vigente) setLoading(false); });
    return () => { vigente = false; };
  }, [id]);

  if (loading) {
    return <div className="page-container"><p className="msg" role="status">Cargando...</p></div>;
  }

  if (error || !oferta) {
    return (
      <div className="page-container">
        <EmptyState iconName="lock" title="No podés editar esta oferta." hint={error || 'Oferta no encontrada.'}>
          <Link to="/empresa/ofertas" className="btn-primary">Volver a mis ofertas</Link>
        </EmptyState>
      </div>
    );
  }

  const rechazada = oferta.estadoModeracion === 'rechazada';

  const handleSubmit = async (payload) => {
    await ofertaService.update(id, payload);
    navigate('/empresa/ofertas');
  };

  return (
    <OfertaForm
      titulo="Editar oferta"
      subtitulo={oferta.titulo}
      aviso={rechazada && (
        <p className={styles.aviso} role="note">
          <Icon name="alert" size={16} />
          El instituto rechazó esta oferta. Al guardar los cambios vuelve a revisión y, si la aprueban,
          se publica.
        </p>
      )}
      submitLabel={rechazada ? 'Guardar y enviar a revisión' : 'Guardar cambios'}
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
      onCancel={() => navigate('/empresa/ofertas')}
    />
  );
}
