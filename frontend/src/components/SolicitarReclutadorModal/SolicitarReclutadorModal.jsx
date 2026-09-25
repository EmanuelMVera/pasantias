import { useState } from 'react';
import { empresaService } from '../../services/empresa.service';
import Modal from '../Modal/Modal';
import styles from './SolicitarReclutadorModal.module.css';

/* ── Modal: Solicitar reclutador ────────────────────────────────────────────── */
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
    <Modal title="📋 Solicitar nuevo reclutador" onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.modalForm}>

        <div className={styles.infoBox}>
          <span>ℹ️</span>
          <span>
            {esConfiable
              ? 'Tu empresa es de confianza institucional: la cuenta se crea de inmediato, sin esperar aprobación del administrador. Las credenciales se envían por email.'
              : 'La solicitud será revisada por el administrador del instituto. Al aprobarla, se creará la cuenta y se enviarán las credenciales por email.'}
          </span>
        </div>

        <div className={styles.fieldGroup}>
          <label>Nombre *</label>
          <input
            type="text"
            value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            placeholder="Juan"
            required
            autoFocus
          />
        </div>

        <div className={styles.fieldGroup}>
          <label>Apellido *</label>
          <input
            type="text"
            value={form.apellido}
            onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))}
            placeholder="Pérez"
            required
          />
        </div>

        <div className={styles.fieldGroup}>
          <label>Email *</label>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="reclutador@empresa.com"
            required
          />
        </div>

        {error && <p className={styles.errorMsg}>⚠️ {error}</p>}

        <div className={styles.modalActions}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancelar</button>
          <button type="submit" className={styles.btnPrimary} disabled={loading}>
            {loading ? 'Enviando...' : '📤 Enviar solicitud'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
