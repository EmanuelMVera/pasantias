/**
 * ReclutadorPerfilPage.jsx — Ficha de un reclutador (solo consulta).
 *
 * Ruta: /reclutador/:usuarioId
 * Consume: GET /api/empresas/reclutadores/:id/perfil
 *
 * El reclutador es una PERSONA que pertenece a una empresa (a diferencia del
 * administrador de empresa, que representa a la entidad y se muestra con el
 * perfil de la empresa). La ficha solo expone datos de contacto básicos y un
 * acceso al perfil público de su empresa (EmpresaPublicaPage, sin duplicarla).
 *
 * El backend decide quién puede verla (misma empresa, o un candidato con
 * relación de chat) y responde 404 en cualquier otro caso. No se edita desde
 * acá ni muestra métricas del reclutador.
 */

import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { empresaService } from '../../services/empresa.service';
import Avatar from '../../components/Avatar/Avatar';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Icon from '../../components/ui/Icon';
import styles from './ReclutadorPerfilPage.module.css';

export default function ReclutadorPerfilPage() {
  const { usuarioId } = useParams();
  const navigate = useNavigate();
  const idValido = /^\d+$/.test(usuarioId ?? '');

  // El resultado guarda a qué id corresponde: al cambiar de reclutador vuelve a
  // "cargando" sin resetear estado dentro del efecto.
  const [resultado, setResultado] = useState(null); // { id, perfil } | { id, error }

  useEffect(() => {
    if (!idValido) return undefined;
    let vigente = true;
    empresaService.getPerfilReclutador(usuarioId)
      .then(({ data }) => { if (vigente) setResultado({ id: usuarioId, perfil: data.data }); })
      .catch((err) => {
        if (!vigente) return;
        setResultado({
          id: usuarioId,
          error: err.response?.status === 404
            ? 'Este perfil no está disponible.'
            : 'No se pudo cargar el perfil del reclutador.',
        });
      });
    return () => { vigente = false; };
  }, [usuarioId, idValido]);

  if (!idValido) return <Navigate to="/" replace />;

  const volver = (
    <button type="button" className={`btn-back ${styles.volver}`} onClick={() => navigate(-1)}>
      <Icon name="arrowLeft" size={16} /> Volver
    </button>
  );

  const actual = resultado?.id === usuarioId ? resultado : null;
  if (!actual) return <div className="page-container"><p className="msg" role="status">Cargando perfil...</p></div>;

  if (actual.error) {
    return (
      <div className="page-container">
        {volver}
        <EmptyState iconName="user" title={actual.error} />
      </div>
    );
  }

  const { perfil } = actual;
  const nombre = `${perfil.nombre} ${perfil.apellido}`.trim();
  const contacto = [
    { key: 'email', label: 'Email', icon: 'mail', valor: perfil.email, href: `mailto:${perfil.email}` },
    { key: 'telefono', label: 'Teléfono', icon: 'phone', valor: perfil.telefono },
    { key: 'ubicacion', label: 'Ubicación', icon: 'mapPin', valor: perfil.ubicacion },
  ].filter((c) => c.valor);

  return (
    <div className={`page-container ${styles.pagina}`}>
      {volver}

      <Card as="section" className={styles.ficha} aria-labelledby="reclutador-nombre">
        <div className={styles.cabecera}>
          <Avatar src={perfil.fotoPerfil} nombre={perfil.nombre} apellido={perfil.apellido} size={96} />
          <div className={styles.identidad}>
            <h1 id="reclutador-nombre" className={styles.nombre}>{nombre}</h1>
            <span className="badge badge-tone-blue">Reclutador</span>
            <span className={styles.empresa}>
              <Icon name="building" size={16} />
              {perfil.empresa.razonSocial}
            </span>
          </div>
        </div>

        <h2 className={styles.subtitulo}>Información de contacto</h2>
        <dl className={styles.contacto}>
          {contacto.map((c) => (
            <div key={c.key} className={styles.dato}>
              <dt><Icon name={c.icon} size={16} /> {c.label}</dt>
              <dd>{c.href ? <a href={c.href}>{c.valor}</a> : c.valor}</dd>
            </div>
          ))}
        </dl>

        <div className={styles.acciones}>
          <Link to={`/empresa/${perfil.empresa.id}`} className="btn-primary">
            <Icon name="building" size={18} />
            Ver empresa
          </Link>
        </div>
      </Card>
    </div>
  );
}
