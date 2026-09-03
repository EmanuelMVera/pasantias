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

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { userService, abrirArchivoPrivado } from '../../services/api';
import Avatar from '../../components/Avatar/Avatar';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import styles from './PerfilPublicoPage.module.css';

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

  // El param es siempre un id numérico; un valor no numérico (typo, subruta
  // inexistente que igual matchea /perfil/:usuarioId) va al fallback.
  const idValido = /^\d+$/.test(usuarioId ?? '');

  useEffect(() => {
    if (!idValido) return;
    let vigente = true;
    userService.getPerfilPublico(usuarioId)
      .then(({ data: res }) => { if (vigente) { setData(res.data); setError(''); } })
      .catch((err) => {
        if (!vigente) return;
        const status = err.response?.status;
        if (status === 403) setError('Este perfil es privado.');
        else if (status === 404) setError('Usuario no encontrado.');
        else setError('Error al cargar el perfil.');
      })
      .finally(() => { if (vigente) setLoading(false); });
    return () => { vigente = false; };
  }, [usuarioId, idValido]);

  if (!idValido) return <Navigate to="/" replace />;

  if (loading) return <div className="page-container"><p className="msg">Cargando perfil...</p></div>;

  if (error) return (
    <div className="page-container">
      <button onClick={() => navigate(-1)} className="btn-back">← Volver</button>
      <EmptyState icon="🔒" title={error} />
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
      <div className={styles.header}>
        <Avatar src={fotoSrc} nombre={data.nombre} apellido={data.apellido} size={80} />

        <div className={styles.headerInfo}>
          <h1 className={styles.headerName}>{data.nombre} {data.apellido}</h1>
          <div className={styles.headerMeta}>
            <span className={`badge badge-${data.rol}`}>{rolLabel}</span>
            {perfil?.carrera && (
              <span className={styles.headerCarrera}>
                {perfil.carrera}{perfil.anioEgreso ? ` · Egresado ${perfil.anioEgreso}` : ''}
              </span>
            )}
          </div>
          {data.ubicacion && (
            <p className={styles.headerUbicacion}>📍 {data.ubicacion}</p>
          )}
        </div>

        {puedeContactar && (
          <div className={styles.headerAcciones}>
            <Button variant="primary" onClick={() => navigate(`/chat/${usuarioId}`)}>
              💬 Contactar
            </Button>
          </div>
        )}
      </div>

      {/* ── Sin perfil ── */}
      {!perfil && (
        <Card>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', margin: 0 }}>
            Este usuario aún no completó su perfil.
          </p>
        </Card>
      )}

      {perfil && (
        <>
          {perfil.descripcion && (
            <Card as="section" title="Sobre mí">
              <p className={styles.prosa}>{perfil.descripcion}</p>
            </Card>
          )}

          {(perfil.areaInteres || perfil.disponibilidad) && (
            <Card as="section" bodyClassName={styles.filaDatos}>
              {perfil.areaInteres && (
                <div className={styles.dato}>
                  <span className={styles.datoLabel}>Área de interés</span>
                  <p className={styles.datoValor}>{perfil.areaInteres}</p>
                </div>
              )}
              {perfil.disponibilidad && (
                <div className={styles.dato}>
                  <span className={styles.datoLabel}>Disponibilidad</span>
                  <p style={{ margin: '0.25rem 0 0' }}>
                    <span
                      className={styles.dispBadge}
                      style={{ background: DISPONIBILIDAD_COLOR[perfil.disponibilidad] ?? '#7f8c8d' }}
                    >
                      {DISPONIBILIDAD_LABEL[perfil.disponibilidad] ?? perfil.disponibilidad}
                    </span>
                  </p>
                </div>
              )}
            </Card>
          )}

          {perfil.habilidades?.length > 0 && (
            <Card as="section" title="Habilidades">
              <div className="tags">
                {perfil.habilidades.map(h => <span key={h} className="tag">{h}</span>)}
              </div>
            </Card>
          )}

          {perfil.idiomas?.length > 0 && (
            <Card as="section" title="Idiomas">
              <div className="tags">
                {perfil.idiomas.map(i => (
                  <span key={i} className={`tag ${styles.tagIdioma}`}>{i}</span>
                ))}
              </div>
            </Card>
          )}

          {perfil.certificaciones?.length > 0 && (
            <Card as="section" title="Certificaciones">
              <ul className={styles.lista}>
                {perfil.certificaciones.map(c => <li key={c}>{c}</li>)}
              </ul>
            </Card>
          )}

          {perfil.experienciaLaboral && (
            <Card as="section" title="Experiencia laboral">
              <p className={styles.prosa}>{perfil.experienciaLaboral}</p>
            </Card>
          )}

          {perfil.proyectos && (
            <Card as="section" title="Proyectos">
              <p className={styles.prosa}>{perfil.proyectos}</p>
            </Card>
          )}

          {(perfil.linkedin || perfil.github || perfil.portfolio || perfil.cvArchivoId) && (
            <Card as="section" title="Redes y contacto">
              <div className={styles.enlaces}>
                {perfil.linkedin && (
                  <Button variant="secondary" href={perfil.linkedin} target="_blank" rel="noopener noreferrer" className={styles.enlace}>
                    💼 LinkedIn
                  </Button>
                )}
                {perfil.github && (
                  <Button variant="secondary" href={perfil.github} target="_blank" rel="noopener noreferrer" className={styles.enlace}>
                    🐙 GitHub
                  </Button>
                )}
                {perfil.portfolio && (
                  <Button variant="secondary" href={perfil.portfolio} target="_blank" rel="noopener noreferrer" className={styles.enlace}>
                    🌐 Portfolio
                  </Button>
                )}
                {perfil.cvArchivoId && (
                  <Button
                    variant="primary"
                    className={styles.enlace}
                    onClick={() => abrirArchivoPrivado(perfil.cvArchivoId, { nombreArchivo: 'CV.pdf' })}
                  >
                    📄 Descargar CV
                  </Button>
                )}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
