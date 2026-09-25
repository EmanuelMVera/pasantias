import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ofertaService } from '../../services/oferta.service';
import { postulacionService } from '../../services/postulacion.service';

const TIPO_PUESTO_CONFIG = {
  pasante: { label: '🎓 Pasante', desc: 'Rol educativo. Sin requerimiento de experiencia previa.',  color: '#0891b2', bg: '#e0f2fe' },
  trainee: { label: '🌱 Trainee', desc: 'Incorporación con acompañamiento y mentoría.',              color: '#16a34a', bg: '#dcfce7' },
  junior:  { label: '💼 Junior',  desc: 'Requiere habilidades comprobables o experiencia inicial.', color: '#7c3aed', bg: '#ede9fe' },
};

export default function OfertaDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [oferta, setOferta] = useState(null);
  const [cartaPresentacion, setCartaPresentacion] = useState('');
  const [postulado, setPostulado] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    ofertaService.getById(id)
      .then(({ data }) => setOferta(data.data))
      .finally(() => setLoading(false));
  }, [id]);

  const handlePostular = async () => {
    setEnviando(true);
    try {
      await postulacionService.postular({ ofertaId: id, cartaPresentacion });
      setPostulado(true);
      setMsg('✅ Te postulaste correctamente.');
    } catch (err) {
      setMsg(err.response?.data?.message || 'Error al postularse.');
    } finally {
      setEnviando(false);
    }
  };

  if (loading) return <p>Cargando...</p>;
  if (!oferta)  return <p>Oferta no encontrada.</p>;

  const tipoCfg = oferta.tipoPuesto ? TIPO_PUESTO_CONFIG[oferta.tipoPuesto] : null;

  return (
    <div className="page-container detalle-container">
      <button onClick={() => navigate(-1)} className="btn-back">← Volver</button>
      <h1>{oferta.titulo}</h1>
      <h2 className="empresa-nombre">
        {oferta.empresaId ? (
          <Link to={`/empresa/${oferta.empresaId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            {oferta.empresa?.razonSocial}
          </Link>
        ) : (
          oferta.empresa?.razonSocial
        )}
      </h2>

      {/* ── Meta principal ──────────────────────────────────────────────── */}
      <div className="oferta-meta">
        {oferta.ciudad    && <span>📍 {oferta.ciudad}</span>}
        {oferta.modalidad && <span>🏢 {oferta.modalidad}</span>}
        {oferta.remuneracion && <span>💰 {oferta.remuneracion}</span>}
        {oferta.fechaLimite && (
          <span>📅 Hasta: {new Date(oferta.fechaLimite).toLocaleDateString('es-AR')}</span>
        )}
      </div>

      {/* ── Tipo de puesto (nuevo) ─────────────────────────────────────── */}
      {tipoCfg ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0' }}>
          <span style={{
            padding: '0.4rem 1rem', borderRadius: '99px', fontWeight: 700,
            fontSize: '0.95rem', color: tipoCfg.color, background: tipoCfg.bg,
          }}>
            {tipoCfg.label}
          </span>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{tipoCfg.desc}</span>
        </div>
      ) : oferta.nivelExperiencia ? (
        // Fallback legacy para ofertas sin tipoPuesto
        <div style={{ margin: '1rem 0' }}>
          <span className={`badge badge-${oferta.nivelExperiencia}`}>
            👤 {oferta.nivelExperiencia.replace(/_/g, ' ')}
          </span>
        </div>
      ) : null}

      {/* ── Experiencia requerida ──────────────────────────────────────── */}
      {oferta.tipoPuesto && (
        <div style={{ margin: '0.5rem 0 1rem', fontSize: '0.9rem' }}>
          {oferta.requiereExperiencia
            ? <span style={{ color: '#b45309', fontWeight: 600 }}>⚡ Requiere experiencia previa</span>
            : <span style={{ color: '#16a34a', fontWeight: 600 }}>✅ Sin experiencia requerida</span>
          }
        </div>
      )}

      {/* ── Detalle de experiencia ─────────────────────────────────────── */}
      {oferta.requiereExperiencia && oferta.experienciaDetalle && (
        <div className="oferta-section">
          <h3>Experiencia requerida</h3>
          <p>{oferta.experienciaDetalle}</p>
        </div>
      )}

      {/* ── Descripción y requisitos ───────────────────────────────────── */}
      <div className="oferta-section">
        <h3>Descripción</h3>
        <p>{oferta.descripcion}</p>
      </div>

      {oferta.requisitos && (
        <div className="oferta-section">
          <h3>Requisitos</h3>
          <p>{oferta.requisitos}</p>
        </div>
      )}

      {/* ── Habilidades requeridas ─────────────────────────────────────── */}
      {oferta.habilidadesRequeridas?.length > 0 && (
        <div className="oferta-section">
          <h3>Habilidades requeridas</h3>
          <div className="tags">
            {oferta.habilidadesRequeridas.map(h => <span key={h} className="tag">{h}</span>)}
          </div>
        </div>
      )}

      {/* ── Carreras destinatarias (nuevo) ────────────────────────────── */}
      {oferta.carrerasDestinatarias?.length > 0 && (
        <div className="oferta-section">
          <h3>Carreras destinatarias</h3>
          <div className="tags">
            {oferta.carrerasDestinatarias.map(c => (
              <span key={c} className="tag" style={{ background: '#f0f6fc', color: '#0073AD' }}>{c}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── Beneficios ────────────────────────────────────────────────── */}
      {oferta.beneficios && (
        <div className="oferta-section">
          <h3>Beneficios</h3>
          <p>{oferta.beneficios}</p>
        </div>
      )}

      {/* ── Postulación ────────────────────────────────────────────────── */}
      {!postulado && (
        <div className="postular-section">
          <h3>Postularse</h3>
          <textarea
            placeholder="Carta de presentación (opcional)"
            value={cartaPresentacion}
            onChange={e => setCartaPresentacion(e.target.value)}
            rows={5}
          />
          <button className="btn-primary" onClick={handlePostular} disabled={enviando}>
            {enviando ? 'Enviando...' : 'Enviar postulación'}
          </button>
        </div>
      )}
      {msg && <p className="msg">{msg}</p>}
    </div>
  );
}
