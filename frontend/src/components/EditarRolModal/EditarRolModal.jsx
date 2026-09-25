import { useState } from 'react';
import { empresaService } from '../../services/empresa.service';
import Modal from '../Modal/Modal';
import styles from './EditarRolModal.module.css';

/* ── Modal: Editar rol ──────────────────────────────────────────────────────── */
// Solo reclutador es asignable manualmente; admin_empresa lo define el flujo de aprobación
const ROLES = [
  { value: 'reclutador', label: 'Reclutador', color: '#0891b2', desc: 'Crea ofertas y gestiona candidatos' },
];

export default function EditarRolModal({ miembro, onClose, onGuardado }) {
  const [rolInterno, setRol] = useState(miembro.rolInterno ?? 'reclutador');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await empresaService.editarMiembro(miembro.id, { rolInterno });
      onGuardado(rolInterno);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cambiar el rol.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={`✏️ Cambiar rol — ${miembro.usuario?.nombre ?? miembro.nombre}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.modalForm}>
        <div className={styles.fieldGroup}>
          <label>Rol en el equipo</label>
          <div className={styles.rolRadioGroup}>
            {ROLES.map(r => (
              <label key={r.value}
                className={`${styles.rolRadio} ${rolInterno === r.value ? styles.rolRadioActive : ''}`}
                style={rolInterno === r.value ? { borderColor: r.color, background: r.color + '12' } : {}}
              >
                <input type="radio" name="rolInterno" value={r.value} checked={rolInterno === r.value} onChange={() => setRol(r.value)} />
                <div>
                  <strong style={rolInterno === r.value ? { color: r.color } : {}}>{r.label}</strong>
                  <span>{r.desc}</span>
                </div>
              </label>
            ))}
          </div>
        </div>
        {error && <p className={styles.errorMsg}>{error}</p>}
        <div className={styles.modalActions}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancelar</button>
          <button type="submit" className={styles.btnPrimary} disabled={loading}>
            {loading ? 'Guardando...' : '✓ Guardar rol'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
