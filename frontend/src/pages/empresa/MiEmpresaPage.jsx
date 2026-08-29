/**
 * MiEmpresaPage.jsx — Visualización y edición del perfil de empresa.
 *
 * admin_empresa: puede ver y editar campos permitidos.
 * reclutador:    solo lectura; campos deshabilitados y sin botón Guardar.
 *
 * Campos editables: descripcion, rubro, sitioWeb, telefono, direccion, ciudad.
 * Campos protegidos (solo lectura): razonSocial, cuit, estadoAprobacion.
 *
 * Ruta: /empresa/mi-empresa
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { empresaService } from '../../services/api';
import { useEmpresa } from '../../hooks/useEmpresa';

const ESTADO_LABEL = {
  aprobada:  '✅ Aprobada',
  pendiente: '⏳ Pendiente de aprobación',
  rechazada: '❌ Rechazada',
};

// ── Normalización de URL ──────────────────────────────────────────────────────
// Agrega "https://" si el valor tiene aspecto de URL pero sin protocolo.
// Devuelve cadena vacía si está vacío. Devuelve null si no parece una URL válida.
function normalizeUrl(raw) {
  if (!raw || !raw.trim()) return '';
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    // Ya tiene protocolo; validar que sea parseable
    try { new URL(trimmed); return trimmed; } catch { return null; }
  }
  // Sin protocolo: verificar que se parece a un dominio (tiene al menos un punto)
  if (/^[\w-]+(\.[\w-]+)+/i.test(trimmed)) {
    const withProtocol = 'https://' + trimmed;
    try { new URL(withProtocol); return withProtocol; } catch { return null; }
  }
  // No parece una URL
  return null;
}

// ── Toast de éxito ────────────────────────────────────────────────────────────
function ToastExito({ mensaje, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: '1.25rem',
        right: '1.25rem',
        zIndex: 1200,
        background: '#16a34a',
        color: '#fff',
        padding: '0.75rem 1.25rem',
        borderRadius: 10,
        fontWeight: 600,
        fontSize: '0.92rem',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        animation: 'fadeInDown 0.25s ease',
      }}
    >
      ✓ {mensaje}
      <button
        onClick={onClose}
        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 700, marginLeft: 4 }}
        aria-label="Cerrar"
      >
        ✕
      </button>
    </div>
  );
}

export default function MiEmpresaPage() {
  const navigate = useNavigate();
  const { esAdminEmpresa, loading: loadingRol } = useEmpresa();

  const [empresa,    setEmpresa]    = useState(null);
  const [form,       setForm]       = useState({});
  const [loading,    setLoading]    = useState(true);
  const [guardando,  setGuardando]  = useState(false);
  const [error,      setError]      = useState('');
  const [showToast,  setShowToast]  = useState(false);
  const [logoFile,     setLogoFile]     = useState(null);
  const [subiendoLogo, setSubiendoLogo] = useState(false);

  // admin_empresa: puede editar. reclutador: solo lectura.
  const esAdmin = esAdminEmpresa;

  useEffect(() => {
    empresaService.getMiEmpresa()
      .then((empRes) => {
        const e = empRes.data?.data ?? empRes.data;
        setEmpresa(e);
        setForm({
          descripcion: e.descripcion ?? '',
          rubro:       e.rubro       ?? '',
          sitioWeb:    e.sitioWeb    ?? '',
          telefono:    e.telefono    ?? '',
          direccion:   e.direccion   ?? '',
          ciudad:      e.ciudad      ?? '',
        });
      })
      .catch(() => setError('No se pudo cargar el perfil de empresa.'))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Normalizar sitioWeb antes de enviar
    const urlNorm = normalizeUrl(form.sitioWeb);
    if (form.sitioWeb.trim() && urlNorm === null) {
      setError('El sitio web no parece una URL válida. Ej: www.empresa.com o https://empresa.com');
      return;
    }

    const payload = { ...form, sitioWeb: urlNorm || '' };

    setGuardando(true);
    try {
      const { data } = await empresaService.updateMiEmpresa(payload);
      const updated = data.data ?? data;
      setEmpresa(updated);
      setForm(prev => ({ ...prev, sitioWeb: updated.sitioWeb ?? '' }));
      setShowToast(true);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al guardar los cambios.');
    } finally {
      setGuardando(false);
    }
  };

  // SEC-03: el logo se sube como imagen validada (JPG/PNG/WEBP, ≤ 2 MB).
  const handleLogoChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (file && file.size > 2 * 1024 * 1024) {
      setError('La imagen del logo no puede superar los 2 MB.');
      e.target.value = '';
      return;
    }
    setError('');
    setLogoFile(file);
  };

  const handleSubirLogo = async () => {
    if (!logoFile) return;
    setSubiendoLogo(true);
    setError('');
    const formData = new FormData();
    formData.append('logo', logoFile);
    try {
      const { data } = await empresaService.subirLogo(formData);
      setEmpresa((prev) => ({ ...prev, logo: data.logo }));
      setLogoFile(null);
      setShowToast(true);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al subir el logo.');
    } finally {
      setSubiendoLogo(false);
    }
  };

  if (loading || loadingRol) return <p className="msg">Cargando...</p>;

  return (
    <div className="page-container" style={{ maxWidth: 720 }}>

      {/* Toast de éxito */}
      {showToast && (
        <ToastExito
          mensaje="Datos de empresa actualizados correctamente."
          onClose={() => setShowToast(false)}
        />
      )}

      <div className="dashboard-header">
        <div>
          <Link to="/empresa" className="btn-back">← Volver al panel</Link>
          <h1>Perfil de empresa</h1>
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {/* Aviso de solo lectura para reclutadores */}
      {!esAdmin && (
        <div style={{
          marginBottom: '1.25rem',
          padding: '0.75rem 1rem',
          background: '#fef9c3',
          border: '1px solid #fbbf24',
          borderRadius: 8,
          fontSize: '0.88rem',
          color: '#92400e',
        }}>
          🔒 Solo el <strong>administrador de empresa</strong> puede modificar estos datos.
          Estás viendo el perfil en modo lectura.
        </div>
      )}

      {/* Datos de solo lectura */}
      <section style={{
        marginBottom: '2rem',
        padding: '1rem 1.25rem',
        background: 'var(--card-bg, #f8fafc)',
        borderRadius: 10,
        border: '1px solid var(--border)',
      }}>
        <h3 style={{ marginTop: 0, fontSize: '0.95rem', color: 'var(--text-muted)' }}>
          Datos institucionales (solo lectura)
        </h3>
        <dl style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '0.4rem 1rem', margin: 0, fontSize: '0.9rem' }}>
          <dt style={{ fontWeight: 600 }}>Razón Social</dt>
          <dd style={{ margin: 0 }}>{empresa?.razonSocial ?? '—'}</dd>
          <dt style={{ fontWeight: 600 }}>CUIT</dt>
          <dd style={{ margin: 0 }}>{empresa?.cuit ?? '—'}</dd>
          <dt style={{ fontWeight: 600 }}>Estado</dt>
          <dd style={{ margin: 0 }}>{ESTADO_LABEL[empresa?.estadoAprobacion] ?? empresa?.estadoAprobacion ?? '—'}</dd>
        </dl>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.75rem', marginBottom: 0 }}>
          Para modificar la razón social o el CUIT, contactate con el administrador del sistema.
        </p>
      </section>

      {/* Logo — solo admin_empresa (SEC-03: subida de imagen validada) */}
      {esAdmin && (
        <section style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>Logo de la empresa</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            {empresa?.logo && (
              <img
                key={empresa.logo}
                src={empresa.logo}
                alt="Logo actual"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                style={{ width: 80, height: 80, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 8, padding: 4 }}
              />
            )}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoChange} />
            <button type="button" className="btn-secondary" onClick={handleSubirLogo} disabled={!logoFile || subiendoLogo}>
              {subiendoLogo ? 'Subiendo...' : 'Subir logo'}
            </button>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>JPG, PNG o WEBP. Máximo 2 MB.</span>
        </section>
      )}

      {/* Formulario */}
      <form onSubmit={esAdmin ? handleSubmit : (e) => e.preventDefault()}>

        <div className="form-group">
          <label htmlFor="rubro">Rubro / Industria</label>
          <input
            id="rubro" name="rubro" type="text"
            value={form.rubro} onChange={handleChange}
            placeholder="Ej: Software y Tecnología"
            disabled={!esAdmin}
          />
        </div>

        <div className="form-group">
          <label htmlFor="descripcion">Descripción de la empresa</label>
          <textarea
            id="descripcion" name="descripcion" rows={5}
            value={form.descripcion} onChange={handleChange}
            placeholder="Contanos brevemente a qué se dedica tu empresa..."
            disabled={!esAdmin}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="sitioWeb">
              Sitio web
              {esAdmin && (
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.4rem' }}>
                  (ej: www.empresa.com)
                </span>
              )}
            </label>
            <input
              id="sitioWeb" name="sitioWeb"
              type="text"
              value={form.sitioWeb} onChange={handleChange}
              placeholder="www.empresa.com"
              disabled={!esAdmin}
            />
          </div>
          <div className="form-group">
            <label htmlFor="telefono">Teléfono institucional</label>
            <input
              id="telefono" name="telefono" type="tel"
              value={form.telefono} onChange={handleChange}
              placeholder="Ej: 11-4300-1234"
              disabled={!esAdmin}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="ciudad">Ciudad</label>
            <input
              id="ciudad" name="ciudad" type="text"
              value={form.ciudad} onChange={handleChange}
              placeholder="Ej: Avellaneda"
              disabled={!esAdmin}
            />
          </div>
          <div className="form-group">
            <label htmlFor="direccion">Dirección</label>
            <input
              id="direccion" name="direccion" type="text"
              value={form.direccion} onChange={handleChange}
              placeholder="Ej: Av. Mitre 1234"
              disabled={!esAdmin}
            />
          </div>
        </div>

        {/* Botones solo para admin_empresa */}
        {esAdmin && (
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando...' : '✓ Guardar cambios'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => navigate('/empresa')}>
              Cancelar
            </button>
          </div>
        )}

        {!esAdmin && (
          <div style={{ marginTop: '1.5rem' }}>
            <button type="button" className="btn-secondary" onClick={() => navigate('/empresa')}>
              ← Volver al panel
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
