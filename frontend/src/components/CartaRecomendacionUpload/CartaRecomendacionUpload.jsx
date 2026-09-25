import { useState } from 'react';
import { userService } from '../../services/user.service';
import { abrirArchivoPrivado } from '../../services/api';
import styles from './CartaRecomendacionUpload.module.css';

/**
 * Sección "Carta de Recomendación" del perfil: ver la carta actual + subir una.
 * `onMensaje(texto)` publica el feedback en la página (que lo muestra y limpia);
 * `onPerfilActualizado(perfil)` le pasa el perfil recargado tras subir.
 */
export default function CartaRecomendacionUpload({ cartaArchivoId, onMensaje, onPerfilActualizado }) {
  const [cartaFile, setCartaFile] = useState(null);
  const [subiendoCarta, setSubiendoCarta] = useState(false);

  const handleSubirCarta = async () => {
    if (!cartaFile) return;
    setSubiendoCarta(true);
    const formData = new FormData();
    formData.append('carta', cartaFile);
    try {
      await userService.subirCartaRecomendacion(formData);
      onMensaje('✅ Carta de recomendación subida correctamente.');
      // Recargar perfil para mostrar el nuevo link
      const { data } = await userService.getPerfil();
      onPerfilActualizado(data.data || {});
    } catch {
      onMensaje('❌ Error al subir la carta de recomendación.');
    } finally {
      setSubiendoCarta(false);
      setTimeout(() => onMensaje(''), 4000);
    }
  };

  return (
    <div className="cv-section">
      <h2>🎓 Carta de Recomendación</h2>
      <p style={{ fontSize: '0.87rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        Podés subir una carta de recomendación de un docente, empleador o entidad académica.
        Es visible para las empresas cuando revisan tu perfil como candidato.
      </p>
      {cartaArchivoId && (
        <p>
          Carta actual:{' '}
          <button
            type="button"
            onClick={() => abrirArchivoPrivado(cartaArchivoId, { nombreArchivo: 'Carta-recomendacion' })}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
          >
            📄 Ver carta actual
          </button>
        </p>
      )}
      <div className={styles.cvUpload}>
        <input
          id="carta-file"
          type="file"
          accept=".pdf,image/*"
          onChange={(e) => setCartaFile(e.target.files[0])}
        />
        <button
          className="btn-secondary"
          onClick={handleSubirCarta}
          disabled={!cartaFile || subiendoCarta}
        >
          {subiendoCarta ? 'Subiendo...' : '⬆️ Subir carta'}
        </button>
      </div>
      <p className={styles.cvHint}>PDF o imagen (JPG, PNG). Máximo 5 MB.</p>
    </div>
  );
}
