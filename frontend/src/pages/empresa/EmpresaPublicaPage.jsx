/**
 * EmpresaPublicaPage.jsx — Vista pública del perfil de una empresa.
 *
 * Ruta: /empresa/:empresaId
 * Roles: alumno, egresado, empresa, admin
 * Consume: GET /api/empresas/:id (requiere sesión)
 *
 * Muestra info pública de la empresa (solo si estadoAprobacion='aprobada')
 * y sus ofertas activas. El botón Contactar solo aparece para alumnos/egresados.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { empresaService } from '../../services/api';

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
      <div style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <span style={{ fontSize: '3rem' }}>🏢</span>
        <p style={{ marginTop: '1rem', fontSize: '1.1rem' }}>{error}</p>
      </div>
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
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1.5rem',
        padding: '1.5rem', background: 'var(--card-bg)', borderRadius: '12px',
        marginBottom: '1.5rem', flexWrap: 'wrap',
      }}>
        {/* Logo o inicial */}
        <div style={{
          width: 80, height: 80, borderRadius: '12px',
          background: 'var(--primary)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '2rem', color: '#fff',
          flexShrink: 0, overflow: 'hidden',
        }}>
          {data.logo
            ? <img src={data.logo} alt={data.razonSocial} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px' }} />
            : data.razonSocial?.[0]?.toUpperCase()
          }
        </div>

        {/* Info principal */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{data.razonSocial}</h1>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.4rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            {data.rubro && <span>🏭 {data.rubro}</span>}
            {data.ciudad && <span>📍 {data.ciudad}</span>}
          </div>
          {data.sitioWeb && (
            <a
              href={data.sitioWeb}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-block', marginTop: '0.4rem', fontSize: '0.85rem', color: 'var(--primary)' }}
            >
              🌐 {data.sitioWeb}
            </a>
          )}
        </div>

        {/* Acciones */}
        {esAlumnoEgresado && data.usuarioId && (
          <button
            className="btn-primary"
            onClick={() => navigate(`/chat/${data.usuarioId}`)}
            style={{ flexShrink: 0 }}
          >
            💬 Contactar
          </button>
        )}
      </div>

      {/* ── Descripción ── */}
      {data.descripcion && (
        <section style={{ background: 'var(--card-bg)', borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Sobre la empresa</h2>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{data.descripcion}</p>
        </section>
      )}

      {/* ── Contacto ── */}
      {(data.direccion || data.telefono) && (
        <section style={{ background: 'var(--card-bg)', borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Contacto</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.9rem' }}>
            {data.direccion && <span>📌 {data.direccion}</span>}
            {data.telefono  && <span>📞 {data.telefono}</span>}
          </div>
        </section>
      )}

      {/* ── Ofertas activas ── */}
      <section>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.15rem' }}>
          Ofertas activas
          <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 400 }}>
            ({ofertas.length})
          </span>
        </h2>

        {ofertas.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--card-bg)', borderRadius: '10px' }}>
            Esta empresa no tiene ofertas activas en este momento.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {ofertas.map((o) => {
              const cardStyle = {
                display: 'block', padding: '1rem 1.25rem',
                background: 'var(--card-bg)', borderRadius: '10px',
                textDecoration: 'none', color: 'inherit',
                border: '1.5px solid var(--border)',
                transition: 'border-color 0.15s',
              };
              const contenido = (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '1rem' }}>{o.titulo}</strong>
                    {o.tipoPuesto && (
                      <span className={`badge badge-puesto badge-${o.tipoPuesto}`} style={{ fontSize: '0.75rem' }}>
                        {o.tipoPuesto === 'pasante' ? '🎓 Pasante' : o.tipoPuesto === 'trainee' ? '🌱 Trainee' : '💼 Junior'}
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: '0.3rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
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
                <Link
                  key={o.id}
                  to={`/ofertas/${o.id}`}
                  style={cardStyle}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  {contenido}
                </Link>
              ) : (
                <div key={o.id} style={cardStyle}>{contenido}</div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
