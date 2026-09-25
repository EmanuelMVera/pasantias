import { useState } from 'react';
import { userService } from '../../services/user.service';
import { useAuth } from '../../hooks/useAuth';

/**
 * Uploader de foto de perfil (se renderiza dentro de "Redes y Portfolio").
 * SEC-03: la foto se sube como imagen validada (JPG/PNG/WEBP, ≤ 2 MB).
 *
 * `fotoInicial`: URL de la foto actual (para la vista previa).
 * `onMensaje(texto)`: feedback en la página (que lo muestra y limpia).
 * `onFotoActualizada(url)`: la página actualiza `form.fotoPerfil` (cuenta para
 * el % de completitud).
 */
export default function FotoPerfilUpload({ fotoInicial, onMensaje, onFotoActualizada }) {
  const { actualizarUsuario } = useAuth();
  const [fotoFile, setFotoFile] = useState(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [fotoPreview, setFotoPreview] = useState(fotoInicial || '');

  const handleFotoChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (file && file.size > 2 * 1024 * 1024) {
      onMensaje('❌ La imagen no puede superar los 2 MB.');
      e.target.value = '';
      return;
    }
    setFotoFile(file);
  };

  const handleSubirFoto = async () => {
    if (!fotoFile) return;
    setSubiendoFoto(true);
    const formData = new FormData();
    formData.append('foto', fotoFile);
    try {
      const { data } = await userService.subirFoto(formData);
      setFotoPreview(data.fotoPerfil);
      onFotoActualizada(data.fotoPerfil);
      actualizarUsuario({ fotoPerfil: data.fotoPerfil });
      setFotoFile(null);
      onMensaje('✅ Foto de perfil actualizada.');
    } catch (err) {
      onMensaje(`❌ Error al subir la foto.${err?.response?.data?.message ? ' ' + err.response.data.message : ''}`);
    } finally {
      setSubiendoFoto(false);
      setTimeout(() => onMensaje(''), 4000);
    }
  };

  return (
    <div className="form-group">
      <label>Foto de perfil</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {fotoPreview && (
          <img
            key={fotoPreview}
            src={fotoPreview}
            alt="Foto de perfil"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            style={{
              width: 72, height: 72, borderRadius: '50%',
              objectFit: 'cover', border: '2px solid var(--border)',
            }}
          />
        )}
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFotoChange} />
        <button
          type="button"
          className="btn-secondary"
          onClick={handleSubirFoto}
          disabled={!fotoFile || subiendoFoto}
        >
          {subiendoFoto ? 'Subiendo...' : 'Subir foto'}
        </button>
      </div>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        JPG, PNG o WEBP. Máximo 2 MB.
      </span>
    </div>
  );
}
