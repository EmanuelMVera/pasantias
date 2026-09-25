/**
 * EmpresaPublicaPage.jsx — Vista pública del perfil de una empresa.
 *
 * Ruta: /empresa/:empresaId
 * Roles: alumno, egresado, empresa, admin
 * Consume: GET /api/empresas/:id (requiere sesión)
 *
 * Muestra info pública de la empresa (solo si estadoAprobacion='aprobada')
 * y sus ofertas activas. No hay botón de contacto directo: el chat con la
 * empresa se habilita únicamente vía una Postulacion (RBAC-06 / reglas de chat).
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { empresaService } from '../../services/empresa.service';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import styles from './EmpresaPublicaPage.module.css';

export default function EmpresaPublicaPage() {
  const { empresaId } = useParams();
  const { usuario } = useAuth();
  const navigate = useNavigate();

  // El param es siempre un id numérico. Un valor no numérico (typo, subruta
  // inexistente que igual matchea esta ruta) → al fallback, no a un fetch basura.
  const idValido = /^\d+$/.test(empresaId ?? '');

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!idValido) return;
    let vigente = true;
    empresaService.getPublico(empresaId)
      .then(({ data: res }) => { if (vigente) { setData(res.data); setError(''); } })
      .catch((err) => {
        if (!vigente) return;
        const status = err.response?.status;
        if (status === 404) setError('Esta empresa no está disponible.');
        else setError('Error al cargar el perfil de la empresa.');
      })
      .finally(() => { if (vigente) setLoading(false); });
    return () => { vigente = false; };
  }, [empresaId, idValido]);

  if (!idValido) return <Navigate to="/" replace />;

  if (loading) return <div className="page-container"><p className="msg">Cargando empresa...</p></div>;

  if (error) return (
    <div className="page-container">
      <button onClick={() => navigate(-1)} className="btn-back">← Volver</button>
      <EmptyState icon="🏢" title={error} />
    </div>
  );

  if (!data) return null;

  const { ofertas = [] } = data;
  // El detalle de oferta (/ofertas/:id) y el chat solo están habilitados para
  // alumnos/egresados; para empresa/admin las ofertas se listan sin enlace.
  const esAlumnoEgresado = ['alumno', 'egresado'].includes(usuario?.rol);

  return (
    <div className="page-container">
      <button onClick={() => navigate(-1)} className="btn-back">← Volver</button>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.logo}>
          {data.logo
            ? <img src={data.logo} alt={data.razonSocial} className={styles.logoImg} />
            : data.razonSocial?.[0]?.toUpperCase()}
        </div>

        <div className={styles.headerInfo}>
          <h1 className={styles.headerName}>{data.razonSocial}</h1>
          <div className={styles.headerMeta}>
            {data.rubro && <span>🏭 {data.rubro}</span>}
            {data.ciudad && <span>📍 {data.ciudad}</span>}
          </div>
          {data.sitioWeb && (
            <a
              href={data.sitioWeb}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.headerWeb}
            >
              🌐 {data.sitioWeb}
            </a>
          )}
        </div>

      </div>

      {/* ── Descripción ── */}
      {data.descripcion && (
        <Card as="section" title="Sobre la empresa">
          <p className={styles.prosa}>{data.descripcion}</p>
        </Card>
      )}

      {/* ── Contacto ── */}
      {(data.direccion || data.telefono) && (
        <Card as="section" title="Contacto">
          <div className={styles.contacto}>
            {data.direccion && <span>📌 {data.direccion}</span>}
            {data.telefono  && <span>📞 {data.telefono}</span>}
          </div>
        </Card>
      )}

      {/* ── Ofertas activas ── */}
      <section>
        <h2 className={styles.ofertasHead}>
          Ofertas activas
          <span className={styles.ofertasCount}>({ofertas.length})</span>
        </h2>

        {ofertas.length === 0 ? (
          <EmptyState title="Esta empresa no tiene ofertas activas en este momento." />
        ) : (
          <div className={styles.ofertasList}>
            {ofertas.map((o) => {
              const contenido = (
                <>
                  <div className={styles.ofertaTop}>
                    <strong className={styles.ofertaTitulo}>{o.titulo}</strong>
                    {o.tipoPuesto && (
                      <span className={`badge badge-puesto badge-${o.tipoPuesto}`} style={{ fontSize: '0.75rem' }}>
                        {o.tipoPuesto === 'pasante' ? '🎓 Pasante' : o.tipoPuesto === 'trainee' ? '🌱 Trainee' : '💼 Junior'}
                      </span>
                    )}
                  </div>
                  <div className={styles.ofertaMeta}>
                    {o.area     && <span>📂 {o.area}</span>}
                    {o.modalidad && <span>🏢 {o.modalidad}</span>}
                    {o.ciudad   && <span>📍 {o.ciudad}</span>}
                    {o.fechaLimite && (
                      <span>📅 Hasta {new Date(o.fechaLimite).toLocaleDateString('es-AR')}</span>
                    )}
                  </div>
                </>
              );

              // Solo alumno/egresado puede abrir /ofertas/:id → para el resto la
              // tarjeta es informativa, no un enlace muerto que rebota.
              return esAlumnoEgresado ? (
                <Link key={o.id} to={`/ofertas/${o.id}`} className={styles.ofertaCard}>
                  {contenido}
                </Link>
              ) : (
                <div key={o.id} className={styles.ofertaCard}>{contenido}</div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
