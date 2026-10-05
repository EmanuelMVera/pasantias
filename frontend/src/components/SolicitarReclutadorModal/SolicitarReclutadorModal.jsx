import { useState } from 'react';
import { empresaService } from '../../services/empresa.service';
import Modal from '../Modal/Modal';
import Icon from '../ui/Icon';
import styles from './SolicitarReclutadorModal.module.css';
import { esEmailValido } from '../../utils/validacion';

/* ── Modal: alta de reclutador ───────────────────────────────────────────────
   El texto cambia según el nivel de confianza de la empresa (la decisión real
   la toma el backend):
   - estándar  → "Solicitar reclutador": la solicitud la revisa el instituto.
   - confiable → "Agregar reclutador": la cuenta se crea de inmediato. */
export default function SolicitarReclutadorModal({ onClose, onEnviada, esConfiable }) {
  const [form, setForm] = useState({ nombre: '', apellido: '', email: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.apellido.trim() || !form.email.trim()) {
      setError('Nombre, apellido y email son requeridos.');
      return;
    }
    if (!esEmailValido(form.email)) {
      setError('El email no tiene un formato válido.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await empresaService.solicitarReclutador(form);
      onEnviada(data.data);
      onClose();
    } catch (err) {
      const code = err.response?.data?.code;
      const msg  = err.response?.data?.message ?? 'Error al enviar la solicitud.';
      // Mensajes específicos según el código de error del backend
      if (code === 'EMAIL_REGISTRADO') {
        setError('Ese email ya tiene una cuenta en el sistema. Contactate con el administrador.');
      } else if (code === 'EMAIL_SOLICITUD_PENDIENTE') {
        setError('Ya existe una solicitud pendiente para ese email en tu empresa.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={esConfiable ? 'Agregar reclutador' : 'Solicitar reclutador'} onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.modalForm}>

        <div className={styles.infoBox}>
          <Icon name={esConfiable ? 'shield' : 'info'} size={18} />
          <span>
            {esConfiable
              ? 'Tu empresa tiene habilitación institucional. La cuenta se creará inmediatamente y las credenciales se enviarán por email.'
              : 'La solicitud será revisada por el administrador del instituto. Al aprobarla se creará la cuenta y se enviarán las credenciales por email.'}
          </span>
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="rec-nombre">Nombre *</label>
          <input
            id="rec-nombre"
            type="text"
            value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            placeholder="Juan"
            required
            autoFocus
          />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="rec-apellido">Apellido *</label>
          <input
            id="rec-apellido"
            type="text"
            value={form.apellido}
            onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))}
            placeholder="Pérez"
            required
          />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="rec-email">Email *</label>
          <input
            id="rec-email"
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="reclutador@empresa.com"
            required
          />
        </div>

        {error && <p className={styles.errorMsg} role="alert">{error}</p>}

        <div className={styles.modalActions}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancelar</button>
          <button type="submit" className={styles.btnPrimary} disabled={loading}>
            {loading ? 'Enviando...' : (esConfiable ? 'Agregar reclutador' : 'Enviar solicitud')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
