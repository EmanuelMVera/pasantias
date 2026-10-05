import { useState } from 'react';
import { userService } from '../../services/user.service';
import { abrirArchivoPrivado } from '../../services/api';
import Icon from '../ui/Icon';
import styles from './CartaRecomendacionUpload.module.css';

/**
 * Sección "Carta de recomendación" del perfil: ver la carta actual + subir una.
 * `onMensaje(texto, tono)`: feedback en la página ('success' | 'error');
 * `onPerfilActualizado(perfil)` le pasa el perfil recargado tras subir.
 */
export default function CartaRecomendacionUpload({ cartaArchivoId, onMensaje, onPerfilActualizado }) {
  const [cartaFile, setCartaFile] = useState(null);
  const [subiendoCarta, setSubiendoCarta] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  const handleSubirCarta = async () => {
    if (!cartaFile) return;
    setSubiendoCarta(true);
    const formData = new FormData();
    formData.append('carta', cartaFile);
    try {
      await userService.subirCartaRecomendacion(formData);
      setCartaFile(null);
      setInputKey((k) => k + 1);
      onMensaje('Carta de recomendación subida correctamente.', 'success');
      // Recargar perfil para mostrar el nuevo link
      const { data } = await userService.getPerfil();
      onPerfilActualizado(data.data || {});
    } catch (err) {
      onMensaje(err?.response?.data?.message || 'No se pudo subir la carta de recomendación.', 'error');
    } finally {
      setSubiendoCarta(false);
    }
  };

  return (
    <section className="cv-section" aria-labelledby="carta-titulo">
      <h2 id="carta-titulo">Carta de recomendación</h2>
      <p className={styles.intro}>
        Opcional. Puede ser de un docente, un empleador o una entidad académica.
        La ven las empresas cuando revisan tu postulación.
      </p>
      {cartaArchivoId && (
        <p className={styles.actual}>
          <Icon name="file" size={18} />
          <button
            type="button"
            className={styles.linkBoton}
            onClick={() => abrirArchivoPrivado(cartaArchivoId, { nombreArchivo: 'Carta-recomendacion' })}
          >
            Ver carta actual
          </button>
        </p>
      )}
      <div className={styles.cvUpload}>
        <input
          key={inputKey}
          id="carta-file"
          aria-label="Archivo de la carta de recomendación (PDF o imagen)"
          type="file"
          accept=".pdf,image/*"
          onChange={(e) => setCartaFile(e.target.files[0] || null)}
        />
        <button
          type="button"
          className="btn-secondary"
          onClick={handleSubirCarta}
          disabled={!cartaFile || subiendoCarta}
        >
          {subiendoCarta ? 'Subiendo...' : (cartaArchivoId ? 'Reemplazar carta' : 'Subir carta')}
        </button>
      </div>
      <p className={styles.cvHint}>PDF o imagen (JPG, PNG). Máximo 5 MB.</p>
    </section>
  );
}
