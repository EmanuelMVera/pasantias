import Modal from '../Modal/Modal';
import styles from './UsuarioFormModal.module.css';

/**
 * Modal de alta / edición de usuario del panel de administración.
 * El estado del formulario y los handlers de guardado viven en la página
 * (AdminUsuariosPage); este componente solo renderiza los campos.
 *
 * modo: 'crear' | 'editar'
 * rolOptions: [{ value, label }] — roles asignables.
 * esPropia: el admin se está editando a sí mismo → no puede cambiar su propio
 *   rol ni desactivar su cuenta (misma protección que el botón Suspender; el
 *   backend sigue siendo la autoridad).
 */
export default function UsuarioFormModal({
  modo,
  form,
  onChange,
  onSubmit,
  onClose,
  formError,
  formLoading,
  rolOptions,
  esPropia = false,
}) {
  return (
    <Modal title={modo === 'crear' ? 'Nuevo usuario' : 'Editar usuario'} onClose={onClose}>
        <form onSubmit={onSubmit} className={styles.form}>
          {formError && <p className="error-msg">{formError}</p>}

          <div className={styles.formRow}>
            <div className="form-group">
              <label htmlFor="u-nombre">Nombre *</label>
              <input id="u-nombre" name="nombre" value={form.nombre} onChange={onChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="u-apellido">Apellido *</label>
              <input id="u-apellido" name="apellido" value={form.apellido} onChange={onChange} required />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="u-email">Email *</label>
            <input id="u-email" name="email" type="email" value={form.email} onChange={onChange} required />
          </div>

          <div className="form-group">
            <label htmlFor="u-password">{modo === 'crear' ? 'Contraseña *' : 'Nueva contraseña (dejar vacío para no cambiar)'}</label>
            <input id="u-password" name="password" type="password" value={form.password} onChange={onChange} required={modo === 'crear'} placeholder={modo === 'editar' ? '••••••••' : ''} />
          </div>

          <div className={styles.formRow}>
            <div className="form-group">
              <label htmlFor="u-rol">Rol *</label>
              <select
                id="u-rol" name="rol" value={form.rol} onChange={onChange} required
                disabled={esPropia}
                aria-describedby={esPropia ? 'u-nota-propia' : undefined}
              >
                {rolOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="u-telefono">Teléfono</label>
              <input id="u-telefono" name="telefono" value={form.telefono} onChange={onChange} placeholder="+54 11 1234-5678" />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="u-ubicacion">Ubicación</label>
            <input id="u-ubicacion" name="ubicacion" value={form.ubicacion} onChange={onChange} placeholder="Ciudad, Provincia" />
          </div>

          {(form.rol === 'alumno' || form.rol === 'egresado') && (
            <div className="form-group">
              <label htmlFor="u-legajo">Legajo *</label>
              <input
                id="u-legajo"
                name="legajo"
                value={form.legajo}
                onChange={onChange}
                required
                placeholder="Ej: 00457"
              />
            </div>
          )}

          {modo === 'editar' && (
            <label className={`${styles.checkboxLabel} ${esPropia ? styles.checkboxDisabled : ''}`}>
              <input
                name="activo" type="checkbox" checked={form.activo} onChange={onChange}
                disabled={esPropia}
                aria-describedby={esPropia ? 'u-nota-propia' : undefined}
              />
              <span>Cuenta activa</span>
            </label>
          )}

          {esPropia && (
            <p id="u-nota-propia" className={styles.notaPropia}>
              Es tu propia cuenta: no podés cambiar tu rol ni desactivarla desde acá.
            </p>
          )}

          <div className={styles.modalFooter}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={formLoading}>
              {formLoading ? 'Guardando...' : (modo === 'crear' ? 'Crear Usuario' : 'Guardar Cambios')}
            </button>
          </div>
        </form>
    </Modal>
  );
}
