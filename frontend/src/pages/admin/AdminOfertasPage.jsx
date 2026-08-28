/**
 * AdminOfertasPage.jsx — Moderación post-publicación de ofertas.
 *
 * Sección 1: Ofertas pendientes de revisión (moderada=false) con acciones: aprobar, pausar, rechazar.
 * Sección 2: Historial de todas las ofertas con filtros por estado.
 *
 * Ruta: /admin/ofertas
 * Rol: admin
 */

import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../services/api';
import Paginacion from '../../components/Paginacion/Paginacion';

const ESTADO_COLOR = {
  activa:    '#27ae60',
  pausada:   '#e67e22',
  rechazada: '#e74c3c',
  cerrada:   '#7f8c8d',
};

const ESTADO_LABEL = {
  activa:    'Activa',
  pausada:   'Pausada',
  rechazada: 'Rechazada',
  cerrada:   'Cerrada',
};

const FILTROS = ['todas', 'activa', 'pausada', 'rechazada', 'cerrada'];

export default function AdminOfertasPage() {
  const [pendientes,   setPendientes]   = useState([]);
  const [todas,        setTodas]        = useState([]);
  const [paginationHist, setPaginationHist] = useState(null);
  const [pageHist,     setPageHist]     = useState(1);
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [loading,      setLoading]      = useState(true);
  const [loadingHist,  setLoadingHist]  = useState(true);
  const [accionando,   setAccionando]   = useState(null);
  const [error,        setError]        = useState('');
  const [mensaje,      setMensaje]      = useState('');

  const cargarPendientes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.getOfertasPendientes();
      setPendientes(res.data?.data ?? []);
    } catch {
      setError('Error al cargar ofertas pendientes.');
    } finally {
      setLoading(false);
    }
  }, []);

  const cargarTodas = useCallback(async (estado, pagina = 1) => {
    setLoadingHist(true);
    try {
      const params = { page: pagina, limit: 25 };
      if (estado && estado !== 'todas') params.estado = estado;
      const res = await adminService.getTodasOfertas(params);
      setTodas(res.data?.data ?? []);
      setPaginationHist(res.data?.pagination ?? null);
      setPageHist(pagina);
    } catch {
      // silencioso — el historial es secundario
    } finally {
      setLoadingHist(false);
    }
  }, []);

  useEffect(() => { cargarPendientes(); }, [cargarPendientes]);
  useEffect(() => { cargarTodas(filtroEstado, 1); }, [filtroEstado, cargarTodas]);

  const handleAccion = async (id, accion) => {
    setAccionando(id);
    setError('');
    setMensaje('');
    try {
      await adminService.moderarOferta(id, accion);
      const labels = { aprobar: 'aprobada', pausar: 'pausada', rechazar: 'rechazada', cerrar: 'cerrada' };
      setMensaje(`Oferta ${labels[accion]} correctamente.`);
      // Quitar de pendientes
      setPendientes((prev) => prev.filter((o) => o.id !== id));
      // Refrescar historial (misma página)
      cargarTodas(filtroEstado, pageHist);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al moderar la oferta.');
    } finally {
      setAccionando(null);
    }
  };

  const ofertasFiltradas = todas;

  return (
    <div className="page-container">

      {/* ── Cabecera ── */}
      <div className="dashboard-header">
        <h1>Moderación de Ofertas</h1>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''} de revisión
        </span>
      </div>

      {error   && <p className="error-msg" style={{ marginBottom: '1rem' }}>⚠️ {error}</p>}
      {mensaje && <p className="success-msg" style={{ marginBottom: '1rem' }}>✅ {mensaje}</p>}

      {/* ── Sección 1: Pendientes ── */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Pendientes de revisión</h2>

        {loading ? (
          <p className="msg">Cargando...</p>
        ) : pendientes.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--card-bg)', borderRadius: '10px' }}>
            No hay ofertas pendientes de moderación.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Oferta</th>
                  <th>Empresa</th>
                  <th>Área</th>
                  <th>Modalidad</th>
                  <th>Publicada</th>
                  <th>Estado actual</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((o) => (
                  <tr key={o.id} style={{ opacity: accionando === o.id ? 0.5 : 1 }}>
                    <td>
                      <strong>{o.titulo}</strong>
                      <span
                        style={{
                          marginLeft: '0.5rem',
                          fontSize: '0.72rem',
                          background: '#3498db',
                          color: '#fff',
                          borderRadius: '4px',
                          padding: '1px 6px',
                        }}
                      >
                        ⏳ Pendiente
                      </span>
                    </td>
                    <td>{o.empresa?.razonSocial ?? '—'}</td>
                    <td>{o.area ?? '—'}</td>
                    <td>{o.modalidad ?? '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                      {o.createdAt ? new Date(o.createdAt).toLocaleDateString('es-AR') : '—'}
                    </td>
                    <td>
                      <span className="badge" style={{ background: ESTADO_COLOR[o.estado] ?? '#7f8c8d' }}>
                        {ESTADO_LABEL[o.estado] ?? o.estado}
                      </span>
                    </td>
                    <td>
                      {accionando === o.id ? (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Procesando...</span>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <button
                            className="btn-ok"
                            style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                            onClick={() => handleAccion(o.id, 'aprobar')}
                            title="Aprobar: la oferta queda activa y moderada"
                          >
                            ✅ Aprobar
                          </button>
                          <button
                            className="btn-warn"
                            style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                            onClick={() => handleAccion(o.id, 'pausar')}
                            title="Pausar: la oferta queda inactiva pero moderada"
                          >
                            ⏸️ Pausar
                          </button>
                          <button
                            className="btn-danger"
                            style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                            onClick={() => handleAccion(o.id, 'rechazar')}
                            title="Rechazar: la empresa es notificada"
                          >
                            ❌ Rechazar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Sección 2: Historial por estado ── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>Historial de ofertas</h2>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {FILTROS.map((f) => (
              <button
                key={f}
                onClick={() => setFiltroEstado(f)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '20px',
                  border: '1.5px solid',
                  borderColor: filtroEstado === f ? (ESTADO_COLOR[f] ?? 'var(--primary)') : 'var(--border)',
                  background: filtroEstado === f ? (ESTADO_COLOR[f] ?? 'var(--primary)') : 'transparent',
                  color: filtroEstado === f ? '#fff' : 'var(--text)',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: filtroEstado === f ? 700 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {f === 'todas' ? 'Todas' : ESTADO_LABEL[f]}
              </button>
            ))}
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginLeft: 'auto' }}>
            {loadingHist ? '...' : `${paginationHist?.total ?? ofertasFiltradas.length} resultado${(paginationHist?.total ?? ofertasFiltradas.length) !== 1 ? 's' : ''}`}
          </span>
        </div>

        {loadingHist ? (
          <p className="msg">Cargando historial...</p>
        ) : ofertasFiltradas.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--card-bg)', borderRadius: '10px' }}>
            No hay ofertas para el filtro seleccionado.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Oferta</th>
                  <th>Empresa</th>
                  <th>Área</th>
                  <th>Modalidad</th>
                  <th>Estado</th>
                  <th>Moderada</th>
                  <th>Publicada</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ofertasFiltradas.map((o) => (
                  <tr key={o.id} style={{ opacity: accionando === o.id ? 0.5 : 1 }}>
                    <td>
                      <strong>{o.titulo}</strong>
                      {!o.moderada && (
                        <span
                          style={{
                            marginLeft: '0.5rem',
                            fontSize: '0.72rem',
                            background: '#3498db',
                            color: '#fff',
                            borderRadius: '4px',
                            padding: '1px 6px',
                          }}
                        >
                          ⏳ Pendiente
                        </span>
                      )}
                    </td>
                    <td>{o.empresa?.razonSocial ?? '—'}</td>
                    <td>{o.area ?? '—'}</td>
                    <td>{o.modalidad ?? '—'}</td>
                    <td>
                      <span className="badge" style={{ background: ESTADO_COLOR[o.estado] ?? '#7f8c8d' }}>
                        {ESTADO_LABEL[o.estado] ?? o.estado}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {o.moderada ? '✅' : '⏳'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                      {o.createdAt ? new Date(o.createdAt).toLocaleDateString('es-AR') : '—'}
                    </td>
                    <td>
                      {accionando === o.id ? (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Procesando...</span>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                          {o.estado !== 'activa' && (
                            <button
                              className="btn-ok"
                              style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                              onClick={() => handleAccion(o.id, 'aprobar')}
                            >
                              Aprobar
                            </button>
                          )}
                          {o.estado !== 'pausada' && (
                            <button
                              className="btn-warn"
                              style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                              onClick={() => handleAccion(o.id, 'pausar')}
                            >
                              Pausar
                            </button>
                          )}
                          {o.estado !== 'rechazada' && (
                            <button
                              className="btn-danger"
                              style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                              onClick={() => handleAccion(o.id, 'rechazar')}
                            >
                              Rechazar
                            </button>
                          )}
                          {o.estado !== 'cerrada' && (
                            <button
                              className="btn-secondary"
                              style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                              onClick={() => handleAccion(o.id, 'cerrar')}
                            >
                              Cerrar
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loadingHist && (
          <Paginacion
            pagination={paginationHist}
            onPageChange={(p) => cargarTodas(filtroEstado, p)}
          />
        )}
      </section>
    </div>
  );
}
