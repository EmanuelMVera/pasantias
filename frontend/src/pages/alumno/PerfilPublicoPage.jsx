/**
 * PerfilPublicoPage.jsx — Vista pública del perfil de un alumno o egresado.
 *
 * Ruta: /perfil/:usuarioId
 * Roles: alumno, egresado, empresa
 * Consume: GET /api/users/:id/perfil
 *
 * Muestra datos públicos del perfil sin campos sensibles (sin email, teléfono,
 * salario pretendido, preferencias laborales). Respeta visibilidadPerfil.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { userService, abrirArchivoPrivado } from '../../services/api';

/** Avatar con foto o inicial como fallback. onError evita mostrar imágenes rotas. */
function AvatarFoto({ fotoSrc, nombre, size = 48, borderRadius = '50%', fontSize = '1.25rem' }) {
  const [error, setError] = useState(false);
  const inicial = (nombre?.[0] ?? '?').toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius,
      background: 'var(--primary)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize, color: '#fff',
      flexShrink: 0, overflow: 'hidden',
    }}>
      {fotoSrc && !error
        ? <img src={fotoSrc} alt={nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setError(true)} />
        : inicial
      }
    </div>
  );
}

const DISPONIBILIDAD_LABEL = {
  inmediata:     'Disponibilidad inmediata',
  '1_mes':       'Disponible en 1 mes',
  '3_meses':     'Disponible en 3 meses',
  no_disponible: 'No disponible',
};

const DISPONIBILIDAD_COLOR = {
  inmediata:     '#27ae60',
  '1_mes':       '#e67e22',
  '3_meses':     '#e67e22',
  no_disponible: '#7f8c8d',
};

export default function PerfilPublicoPage() {
  const { usuarioId } = useParams();
  const { usuario } = useAuth();
  const navigate = useNavigate();

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    userService.getPerfilPublico(usuarioId)
      .then(({ data: res }) => setData(res.data))
      .catch((err) => {
        const status = err.response?.status;
        if (status === 403) setError('Este perfil es privado.');
        else if (status === 404) setError('Usuario no encontrado.');
        else setError('Error al cargar el perfil.');
      })
      .finally(() => setLoading(false));
  }, [usuarioId]);

  if (loading) return <div className="page-container"><p className="msg">Cargando perfil...</p></div>;

  if (error) return (
    <div className="page-container">
      <button onClick={() => navigate(-1)} className="btn-back">← Volver</button>
      <div style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <span style={{ fontSize: '3rem' }}>🔒</span>
        <p style={{ marginTop: '1rem', fontSize: '1.1rem' }}>{error}</p>
      </div>
    </div>
  );

  if (!data) return null;

  const { perfil } = data;
  const puedeContactar = usuario?.id !== Number(usuarioId) && usuario?.rol !== 'admin';
  const rolLabel = data.rol === 'egresado' ? 'Egresado' : 'Alumno';
  // Priorizar foto de perfil (perfiles.fotoPerfil), fallback a usuarios.fotoPerfil
  const fotoSrc = perfil?.fotoPerfil || data.fotoPerfil || null;

  return (
    <div className="page-container">
      <button onClick={() => navigate(-1)} className="btn-back">← Volver</button>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1.5rem',
        padding: '1.5rem', background: 'var(--card-bg)', borderRadius: '12px',
        marginBottom: '1.5rem', flexWrap: 'wrap',
      }}>
        {/* Avatar */}
        <AvatarFoto
          fotoSrc={fotoSrc}
          nombre={data.nombre}
          size={80}
          borderRadius="50%"
          fontSize="2rem"
        />

        {/* Info principal */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{data.nombre} {data.apellido}</h1>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className={`badge badge-${data.rol}`}>{rolLabel}</span>
            {perfil?.carrera && (
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                {perfil.carrera}{perfil.anioEgreso ? ` · Egresado ${perfil.anioEgreso}` : ''}
              </span>
            )}
          </div>
          {data.ubicacion && (
            <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              📍 {data.ubicacion}
            </p>
          )}
        </div>

        {/* Acciones */}
        {puedeContactar && (
          <button
            className="btn-primary"
            onClick={() => navigate(`/chat/${usuarioId}`)}
            style={{ flexShrink: 0 }}
          >
            💬 Contactar
          </button>
        )}
      </div>

      {/* ── Sin perfil ── */}
      {!perfil && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--card-bg)', borderRadius: '10px' }}>
          Este usuario aún no completó su perfil.
        </div>
      )}

      {perfil && (
        <>
          {/* ── Sobre mí ── */}
          {perfil.descripcion && (
            <section style={{ background: 'var(--card-bg)', borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem' }}>
              <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Sobre mí</h2>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{perfil.descripcion}</p>
            </section>
          )}

          {/* ── Intereses y disponibilidad ── */}
          {(perfil.areaInteres || perfil.disponibilidad) && (
            <section style={{ background: 'var(--card-bg)', borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              {perfil.areaInteres && (
                <div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Área de interés</span>
                  <p style={{ margin: '0.25rem 0 0', fontWeight: 600 }}>{perfil.areaInteres}</p>
                </div>
              )}
              {perfil.disponibilidad && (
                <div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Disponibilidad</span>
                  <p style={{ margin: '0.25rem 0 0' }}>
                    <span style={{
                      background: DISPONIBILIDAD_COLOR[perfil.disponibilidad] ?? '#7f8c8d',
                      color: '#fff', borderRadius: '12px', padding: '2px 10px', fontSize: '0.85rem', fontWeight: 600,
                    }}>
                      {DISPONIBILIDAD_LABEL[perfil.disponibilidad] ?? perfil.disponibilidad}
                    </span>
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ── Habilidades ── */}
          {perfil.habilidades?.length > 0 && (
            <section style={{ background: 'var(--card-bg)', borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem' }}>
              <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Habilidades</h2>
              <div className="tags">
                {perfil.habilidades.map(h => <span key={h} className="tag">{h}</span>)}
              </div>
            </section>
          )}

          {/* ── Idiomas ── */}
          {perfil.idiomas?.length > 0 && (
            <section style={{ background: 'var(--card-bg)', borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem' }}>
              <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Idiomas</h2>
              <div className="tags">
                {perfil.idiomas.map(i => <span key={i} className="tag" style={{ background: '#f0f6fc', color: '#0073AD' }}>{i}</span>)}
              </div>
            </section>
          )}

          {/* ── Certificaciones ── */}
          {perfil.certificaciones?.length > 0 && (
            <section style={{ background: 'var(--card-bg)', borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem' }}>
              <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Certificaciones</h2>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {perfil.certificaciones.map(c => <li key={c}>{c}</li>)}
              </ul>
            </section>
          )}

          {/* ── Experiencia laboral ── */}
          {perfil.experienciaLaboral && (
            <section style={{ background: 'var(--card-bg)', borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem' }}>
              <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Experiencia laboral</h2>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{perfil.experienciaLaboral}</p>
            </section>
          )}

          {/* ── Proyectos ── */}
          {perfil.proyectos && (
            <section style={{ background: 'var(--card-bg)', borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem' }}>
              <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Proyectos</h2>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{perfil.proyectos}</p>
            </section>
          )}

          {/* ── Redes y CV ── */}
          {(perfil.linkedin || perfil.github || perfil.portfolio || perfil.cvArchivoId) && (
            <section style={{ background: 'var(--card-bg)', borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem' }}>
              <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Redes y contacto</h2>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {perfil.linkedin && (
                  <a href={perfil.linkedin} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ fontSize: '0.85rem' }}>
                    💼 LinkedIn
                  </a>
                )}
                {perfil.github && (
                  <a href={perfil.github} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ fontSize: '0.85rem' }}>
                    🐙 GitHub
                  </a>
                )}
                {perfil.portfolio && (
                  <a href={perfil.portfolio} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ fontSize: '0.85rem' }}>
                    🌐 Portfolio
                  </a>
                )}
                {perfil.cvArchivoId && (
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ fontSize: '0.85rem' }}
                    onClick={() => abrirArchivoPrivado(perfil.cvArchivoId, { nombreArchivo: 'CV.pdf' })}
                  >
                    📄 Descargar CV
                  </button>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
