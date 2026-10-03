/**
 * HistorialPostulacionModal.jsx — línea de tiempo de una postulación.
 *
 *   <HistorialPostulacionModal postulacion={p} onClose={...} />
 *
 * Muestra los cambios de estado reales registrados por el backend
 * (GET /api/postulaciones/:id/historial → PostulacionHistorialEstado): qué
 * estado, cuándo y quién lo cambió. Solo lectura; no incluye notas internas.
 */

import { useEffect, useState } from 'react';
import { postulacionService } from '../../services/postulacion.service';
import Modal from '../Modal/Modal';
import Icon from '../ui/Icon';
import { getEstadoInfo } from '../../constants/postulacionEstados';
import styles from './HistorialPostulacionModal.module.css';

const formatFechaHora = (iso) => new Date(iso).toLocaleString('es-AR', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export default function HistorialPostulacionModal({ postulacion, onClose }) {
  const [resultado, setResultado] = useState(null); // { pasos } | { error }

  useEffect(() => {
    let vigente = true;
    postulacionService.getHistorial(postulacion.id)
      .then(({ data }) => { if (vigente) setResultado({ pasos: data.data ?? [] }); })
      .catch((err) => {
        if (vigente) setResultado({ error: err.response?.data?.message ?? 'No se pudo cargar el historial.' });
      });
    return () => { vigente = false; };
  }, [postulacion.id]);

  const nombre = `${postulacion.usuario?.nombre ?? ''} ${postulacion.usuario?.apellido ?? ''}`.trim() || 'Candidato';

  return (
    <Modal title="Historial del proceso" onClose={onClose} maxWidth={480}>
      <div className={styles.cuerpo}>
        <p className={styles.contexto}>Postulación de <strong>{nombre}</strong>.</p>

        {!resultado && <p className="msg" role="status">Cargando historial...</p>}
        {resultado?.error && <p className="error-msg" role="alert">{resultado.error}</p>}
        {resultado?.pasos?.length === 0 && (
          <p className={styles.vacio}>Esta postulación no tiene cambios de estado registrados.</p>
        )}

        {resultado?.pasos?.length > 0 && (
          <ol className={styles.linea}>
            {resultado.pasos.map((paso, i) => {
              const info = getEstadoInfo(paso.estadoNuevo);
              const inicial = paso.estadoAnterior === null;
              const autor = paso.cambiadoPor ? `${paso.cambiadoPor.nombre} ${paso.cambiadoPor.apellido}` : null;
              const actual = i === resultado.pasos.length - 1;
              return (
                <li key={paso.id} className={`${styles.paso} ${actual ? styles.pasoActual : ''}`}>
                  <span className={`${styles.punto} ${styles[`tono_${info.tone}`] ?? ''}`}>
                    <Icon name={inicial ? 'send' : info.icon} size={15} strokeWidth={2} />
                  </span>
                  <div className={styles.pasoInfo}>
                    <span className={styles.pasoTitulo}>
                      {inicial ? 'Postulación recibida' : info.label}
                      {actual && <span className={styles.actual}>Estado actual</span>}
                    </span>
                    <span className={styles.pasoDato}>
                      {formatFechaHora(paso.createdAt)}
                      {autor && !inicial && ` · por ${autor}`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div className={styles.acciones}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </Modal>
  );
}
