/**
 * CandidatosEmpresaPage.jsx — Vista consolidada de candidatos de la empresa.
 *
 * Muestra todos los candidatos de todas las ofertas de la empresa.
 * Permite filtrar por estado desde las tabs.
 * Al hacer click en "Ver oferta" lleva a /empresa/postulantes/:ofertaId.
 *
 * Ruta: /empresa/candidatos?estado=X
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { empresaService } from '../../services/api';
import Avatar from '../../components/Avatar/Avatar';
import { getEstadoInfo } from '../../constants/postulacionEstados';

// Labels en plural para las tabs de filtro — los `value` son los estados
// canónicos de constants/postulacionEstados.js (fuente de color/label/emoji).
const ESTADOS_TABS = [
  { value: '',             label: 'Todos' },
  { value: 'en_revision',  label: 'En revisión' },
  { value: 'preseleccionado', label: 'Preseleccionados' },
  { value: 'entrevista',   label: 'Entrevista' },
  { value: 'contratado',   label: 'Contratados' },
  { value: 'rechazado',    label: 'No seleccionados' },
];

function formatFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function CandidatosEmpresaPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const estadoParam = searchParams.get('estado') ?? '';

  const [candidatos, setCandidatos] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  const cargar = useCallback(async (estado) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await empresaService.getCandidatos(estado ? { estado } : {});
      setCandidatos(data.data ?? []);
    } catch {
      setError('No se pudieron cargar los candidatos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar(estadoParam);
  }, [cargar, estadoParam]);

  const handleTab = (valor) => {
    if (valor) setSearchParams({ estado: valor });
    else setSearchParams({});
  };

  return (
    <div className="page-container">
      <div className="dashboard-header">
        <div>
          <Link to="/empresa" className="btn-back">← Volver al panel</Link>
          <h1>Candidatos</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Todos los postulantes de todas tus ofertas.
          </p>
        </div>
      </div>

      {/* Tabs de filtro */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {ESTADOS_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => handleTab(tab.value)}
            style={{
              padding: '0.35rem 0.9rem',
              borderRadius: 99,
              border: `1.5px solid ${estadoParam === tab.value ? 'var(--primary)' : 'var(--border)'}`,
              background: estadoParam === tab.value ? 'var(--primary)' : 'transparent',
              color: estadoParam === tab.value ? '#fff' : 'var(--text)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: estadoParam === tab.value ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="error-msg">{error}</p>}

      {loading ? (
        <p className="msg">Cargando candidatos...</p>
      ) : candidatos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <span style={{ fontSize: '2rem' }}>📭</span>
          <p>No hay candidatos{estadoParam ? ` en estado "${estadoParam}"` : ''} por el momento.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="tabla">
            <thead>
              <tr>
                <th>Candidato</th>
                <th>Email</th>
                <th>Oferta</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {candidatos.map(p => (
                <tr key={p.id}>
                  <td style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'nowrap' }}>
                    <Avatar
                      src={p.usuario?.fotoPerfil}
                      nombre={p.usuario?.nombre}
                      apellido={p.usuario?.apellido}
                      size={32}
                      style={{ fontSize: '0.85rem', verticalAlign: 'middle', marginRight: '0.5rem' }}
                    />
                    {p.usuario?.id ? (
                      <Link to={`/perfil/${p.usuario.id}`} style={{ color: 'inherit', textDecoration: 'underline' }}>
                        <strong>{p.usuario?.nombre} {p.usuario?.apellido}</strong>
                      </Link>
                    ) : (
                      <strong>{p.usuario?.nombre} {p.usuario?.apellido}</strong>
                    )}
                  </td>
                  <td style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>{p.usuario?.email}</td>
                  <td>
                    <span style={{ fontSize: '0.9rem' }}>{p.oferta?.titulo ?? '—'}</span>
                    {p.oferta?.area && <small style={{ display: 'block', color: 'var(--text-muted)' }}>{p.oferta.area}</small>}
                  </td>
                  <td>
                    {(() => {
                      const info = getEstadoInfo(p.estado);
                      return (
                        <span style={{
                          padding: '2px 8px', borderRadius: 99, fontSize: '0.8rem',
                          background: info.color + '22',
                          color: info.color,
                          fontWeight: 600,
                        }}>
                          {info.emoji} {info.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>{formatFecha(p.updatedAt)}</td>
                  <td>
                    {p.oferta?.id && (
                      <Link to={`/empresa/postulantes/${p.oferta.id}`} className="btn-small">
                        Ver oferta
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
