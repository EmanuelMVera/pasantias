import { useState } from 'react';
import { userService } from '../../services/user.service';
import { abrirArchivoPrivado } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import styles from './CvUpload.module.css';

// Email de la cuenta demo del alumno (seedPresentacion.js::ALUMNO) — solo se
// usa para mostrar un aviso más específico; no afecta ninguna regla real.
const ALUMNO_DEMO_EMAIL = 'alumno@demo.com';

/**
 * Sección "Currículum Vitae" del perfil: ver el CV actual + subir uno nuevo.
 * `onMensaje(texto)` publica el feedback en la página (que lo muestra y limpia).
 */
export default function CvUpload({ cvArchivoId, onMensaje }) {
  const { usuario } = useAuth();
  const [cvFile, setCvFile] = useState(null);
  const [subiendoCV, setSubiendoCV] = useState(false);

  const handleSubirCV = async () => {
    if (!cvFile) return;
    setSubiendoCV(true);
    const formData = new FormData();
    formData.append('cv', cvFile);
    try {
      await userService.subirCV(formData);
      onMensaje('✅ CV subido correctamente.');
    } catch {
      onMensaje('❌ Error al subir el CV.');
    } finally {
      setSubiendoCV(false);
      setTimeout(() => onMensaje(''), 4000);
    }
  };

  return (
    <div className="cv-section">
      <h2>Currículum Vitae</h2>
      {cvArchivoId ? (
        <p>
          CV actual:{' '}
          <button
            type="button"
            onClick={() => abrirArchivoPrivado(cvArchivoId, { nombreArchivo: 'CV.pdf' })}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
          >
            📄 Ver CV actual
          </button>
        </p>
      ) : (
        <p className={styles.cvAviso}>
          {usuario?.email === ALUMNO_DEMO_EMAIL
            ? '⚠️ CV no cargado en este entorno de demostración.'
            : '⚠️ No cargaste tu CV todavía. Las empresas no van a poder verlo hasta que subas uno.'}
        </p>
      )}
      <div className={styles.cvUpload}>
        <input
          type="file"
          accept=".pdf"
          onChange={(e) => setCvFile(e.target.files[0])}
        />
        <button
          className="btn-secondary"
          onClick={handleSubirCV}
          disabled={!cvFile || subiendoCV}
        >
          {subiendoCV ? 'Subiendo...' : '⬆️ Subir nuevo CV'}
        </button>
      </div>
      <p className={styles.cvHint}>Solo archivos PDF. Máximo 5 MB.</p>
    </div>
  );
}
