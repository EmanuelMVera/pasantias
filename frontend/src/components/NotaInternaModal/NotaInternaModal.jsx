/**
 * NotaInternaModal.jsx — nota interna de una postulación.
 *
 *   <NotaInternaModal postulacion={p} onClose={...} onGuardada={(mensaje) => ...} />
 *
 * Una sola nota editable por postulación (`notasEmpresa`): seguimiento privado
 * del reclutador responsable. El candidato nunca la ve ni recibe aviso. No hay
 * comentarios múltiples, menciones ni adjuntos.
 *
 * Guarda con PATCH /api/postulaciones/:id/estado enviando solo `notasEmpresa`
 * (el backend valida que quien guarda sea el responsable de la oferta).
 */

import { useState } from 'react';
import { postulacionService } from '../../services/postulacion.service';
import Modal from '../Modal/Modal';
import Icon from '../ui/Icon';
import styles from './NotaInternaModal.module.css';

const MAX = 2000;

export default function NotaInternaModal({ postulacion, onClose, onGuardada }) {
  const inicial = postulacion.notasEmpresa ?? '';
  const [texto, setTexto] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const nombre = `${postulacion.usuario?.nombre ?? ''} ${postulacion.usuario?.apellido ?? ''}`.trim() || 'el candidato';
  const sinCambios = texto.trim() === inicial.trim();

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await postulacionService.updateNota(postulacion.id, texto.trim());
      onGuardada(texto.trim() ? 'Nota interna guardada.' : 'Nota interna eliminada.');
    } catch (err) {
      setError(err.response?.data?.message ?? 'No se pudo guardar la nota.');
      setGuardando(false);
    }
  };

  return (
    <Modal title="Nota interna" onClose={guardando ? () => {} : onClose} closeOnOverlayClick={!guardando} maxWidth={520}>
      <form onSubmit={guardar} className={styles.cuerpo}>
        <p className={styles.contexto}>Sobre la postulación de <strong>{nombre}</strong>.</p>

        <div className={styles.campo}>
          <label htmlFor="nota-interna">Nota</label>
          <textarea
            id="nota-interna"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={6}
            maxLength={MAX}
            placeholder="Ej: Buen dominio de React. Revisar disponibilidad horaria en la entrevista."
            disabled={guardando}
            aria-describedby="nota-interna-ayuda"
          />
          <div className={styles.pie}>
            <span id="nota-interna-ayuda" className={styles.ayuda}>
              <Icon name="lock" size={14} /> Solo la ve tu empresa. El candidato no la ve ni recibe aviso.
            </span>
            <span className={styles.contador}>{texto.length}/{MAX}</span>
          </div>
        </div>

        {error && <p className="error-msg" role="alert">{error}</p>}

        <div className={styles.acciones}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={guardando || sinCambios}>
            {guardando ? 'Guardando…' : 'Guardar nota'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
