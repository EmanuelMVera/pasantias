import { useState } from 'react';
import { userService } from '../../services/user.service';
import { abrirArchivoPrivado } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import Icon from '../ui/Icon';
import styles from './CvUpload.module.css';

// Email de la cuenta demo del alumno (seedPresentacion.js::ALUMNO) — solo se
// usa para mostrar un aviso más específico; no afecta ninguna regla real.
const ALUMNO_DEMO_EMAIL = 'alumno@demo.com';

/**
 * Sección "Currículum Vitae" del perfil: ver el CV actual + subir uno nuevo.
 * Sin CV el backend rechaza las postulaciones (CV_REQUERIDO).
 *
 * `onMensaje(texto, tono)`: feedback en la página ('success' | 'error').
 * `onCvActualizado({ cvPath, cvArchivoId })`: la página refleja el CV nuevo
 * (link "Ver CV actual" y % de completitud) sin recargar.
 */
export default function CvUpload({ cvArchivoId, onMensaje, onCvActualizado }) {
  const { usuario } = useAuth();
  const [cvFile, setCvFile] = useState(null);
  const [subiendoCV, setSubiendoCV] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  const handleSubirCV = async () => {
    if (!cvFile) return;
    setSubiendoCV(true);
    const formData = new FormData();
    formData.append('cv', cvFile);
    try {
      const { data } = await userService.subirCV(formData);
      onCvActualizado?.({ cvPath: data.cvPath, cvArchivoId: data.cvArchivoId });
      setCvFile(null);
      setInputKey((k) => k + 1);
      onMensaje('CV subido correctamente.', 'success');
    } catch (err) {
      onMensaje(err?.response?.data?.message || 'No se pudo subir el CV.', 'error');
    } finally {
      setSubiendoCV(false);
    }
  };

  return (
    <section className="cv-section" id="cv" aria-labelledby="cv-titulo">
      <h2 id="cv-titulo">Currículum Vitae</h2>
      {cvArchivoId ? (
        <p className={styles.cvActual}>
          <Icon name="file" size={18} />
          <button
            type="button"
            className={styles.linkBoton}
            onClick={() => abrirArchivoPrivado(cvArchivoId, { nombreArchivo: 'CV.pdf' })}
          >
            Ver CV actual
          </button>
        </p>
      ) : (
        <p className={styles.cvAviso}>
          <Icon name="alert" size={18} />
          {usuario?.email === ALUMNO_DEMO_EMAIL
            ? 'CV no cargado en este entorno de demostración.'
            : 'Todavía no cargaste tu CV: lo necesitás para postularte.'}
        </p>
      )}
      <div className={styles.cvUpload}>
        <input
          key={inputKey}
          id="cv-file"
          aria-label="Archivo de CV (PDF)"
          type="file"
          accept=".pdf"
          onChange={(e) => setCvFile(e.target.files[0] || null)}
        />
        <button
          type="button"
          className="btn-secondary"
          onClick={handleSubirCV}
          disabled={!cvFile || subiendoCV}
        >
          {subiendoCV ? 'Subiendo...' : (cvArchivoId ? 'Reemplazar CV' : 'Subir CV')}
        </button>
      </div>
      <p className={styles.cvHint}>Solo archivos PDF. Máximo 5 MB.</p>
    </section>
  );
}
