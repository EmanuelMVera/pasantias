/**
 * AsignarResponsableModal.jsx — asignar o cambiar el reclutador responsable de
 * una oferta (acción de gobierno del administrador de empresa).
 *
 *   <AsignarResponsableModal
 *     oferta={oferta} reclutadores={[{ id, nombre }]} empresaNombre="Delta IT"
 *     onClose={...} onAsignado={(mensaje) => ...}
 *   />
 *
 * - `reclutadores` trae SOLO los reclutadores activos de la empresa (el backend
 *   vuelve a validarlo: nunca el admin_empresa, un suspendido ni otra empresa).
 * - Oferta sin responsable → "Asignar responsable": se confirma en un paso.
 * - Oferta con responsable → "Cambiar responsable": pide una confirmación
 *   explícita con el traspaso (de quién a quién) antes de enviar.
 * - Solo cambia el responsable: no toca el contenido ni las postulaciones.
 */

import { useState } from 'react';
import { empresaService } from '../../services/empresa.service';
import Modal from '../Modal/Modal';
import styles from './AsignarResponsableModal.module.css';

export default function AsignarResponsableModal({ oferta, reclutadores, empresaNombre, onClose, onAsignado }) {
  const actual = oferta.creadaPor ? `${oferta.creadaPor.nombre} ${oferta.creadaPor.apellido}` : null;
  const esCambio = Boolean(oferta.creadaPorUsuarioId);
  const opciones = reclutadores.filter((r) => r.id !== oferta.creadaPorUsuarioId);

  const [seleccion, setSeleccion] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const elegido = opciones.find((r) => String(r.id) === seleccion) ?? null;
  const titulo = esCambio ? 'Cambiar responsable' : 'Asignar responsable';

  const enviar = async () => {
    setEnviando(true);
    setError('');
    try {
      await empresaService.asignarResponsableOferta(oferta.id, elegido.id);
      onAsignado(esCambio
        ? `${elegido.nombre} es el nuevo responsable de la oferta.`
        : `${elegido.nombre} quedó como responsable de la oferta.`);
    } catch (err) {
      setError(err.response?.data?.message ?? 'No se pudo asignar el responsable.');
      setConfirmando(false);
    } finally {
      setEnviando(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!elegido) return;
    if (esCambio) setConfirmando(true); else enviar();
  };

  return (
    <Modal title={titulo} onClose={enviando ? () => {} : onClose} closeOnOverlayClick={!enviando} maxWidth={480}>
      {confirmando ? (
        <div className={styles.cuerpo}>
          <p className={styles.pregunta}>¿Cambiar el responsable de esta oferta?</p>
          <p className={styles.texto}>
            La oferta <strong>“{oferta.titulo}”</strong> pasará de <strong>{actual ?? 'su responsable anterior'}</strong> a{' '}
            <strong>{elegido.nombre}</strong>. Los candidatos y el historial del proceso se conservarán.
          </p>
          {error && <p className="error-msg" role="alert">{error}</p>}
          <div className={styles.acciones}>
            <button type="button" className="btn-secondary" onClick={() => setConfirmando(false)} disabled={enviando}>
              Volver
            </button>
            <button type="button" id="btn-confirmar-responsable" className="btn-primary" onClick={enviar} disabled={enviando}>
              {enviando ? 'Procesando…' : 'Sí, cambiar responsable'}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className={styles.cuerpo}>
          <dl className={styles.resumen}>
            <div>
              <dt>Oferta</dt>
              <dd>{oferta.titulo}</dd>
            </div>
            <div>
              <dt>Responsable actual</dt>
              <dd>{actual ?? <span className={styles.sinDato}>Sin responsable asignado</span>}</dd>
            </div>
          </dl>

          <div className={styles.campo}>
            <label htmlFor="responsable-oferta">{esCambio ? 'Nuevo responsable' : 'Responsable'}</label>
            <select
              id="responsable-oferta"
              value={seleccion}
              onChange={(e) => setSeleccion(e.target.value)}
              disabled={enviando || opciones.length === 0}
              required
            >
              <option value="">Elegí un reclutador…</option>
              {opciones.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
            <p className={styles.ayuda}>
              {opciones.length === 0
                ? 'No hay otros reclutadores activos en el equipo para asignar.'
                : `Solo se muestran reclutadores activos de ${empresaNombre || 'tu empresa'}.`}
            </p>
          </div>

          {error && <p className="error-msg" role="alert">{error}</p>}

          <div className={styles.acciones}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={enviando}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={enviando || !elegido}>
              {enviando ? 'Procesando…' : titulo}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
