/**
 * SeguridadPage.jsx — Página de seguridad de cuenta para usuarios empresa/reclutador.
 *
 * Permite cambiar la contraseña actual verificando que conoce la contraseña vigente.
 * La nueva debe tener al menos 8 caracteres (regla única del sistema, la misma
 * que valida el backend).
 *
 * Ruta: /empresa/seguridad — se abre desde el menú de usuario ("Seguridad de mi
 * cuenta") para el administrador de empresa, y desde el panel para el reclutador.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import { useAuth } from '../../hooks/useAuth';
import { calcularFortalezaPassword, PASSWORD_MIN_LENGTH } from '../../utils/passwordStrength';
import PageHeader from '../../components/ui/PageHeader';
import Icon from '../../components/ui/Icon';
import styles from './SeguridadPage.module.css';

export default function SeguridadPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    passwordActual:      '',
    nuevaPassword:       '',
    confirmarPassword:   '',
  });

  const [mostrar, setMostrar] = useState({
    actual:    false,
    nueva:     false,
    confirmar: false,
  });

  const [estado, setEstado] = useState('idle'); // 'idle' | 'loading' | 'ok' | 'error'
  const [mensaje, setMensaje] = useState('');

  // ── Handlers ────────────────────────────────────────────────────────────────
  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    // Limpiar estado al editar
    if (estado !== 'idle') { setEstado('idle'); setMensaje(''); }
  }

  function toggleMostrar(campo) {
    setMostrar(prev => ({ ...prev, [campo]: !prev[campo] }));
  }

  // ── Validación local ─────────────────────────────────────────────────────────
  function validar() {
    if (!form.passwordActual) return 'Ingresá tu contraseña actual.';
    if (!form.nuevaPassword)  return 'Ingresá la nueva contraseña.';
    if (form.nuevaPassword.length < PASSWORD_MIN_LENGTH) return `La nueva contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
    if (form.nuevaPassword !== form.confirmarPassword) return 'Las contraseñas nuevas no coinciden.';
    if (form.passwordActual === form.nuevaPassword) return 'La nueva contraseña debe ser diferente a la actual.';
    return null;
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    const errorLocal = validar();
    if (errorLocal) {
      setEstado('error');
      setMensaje(errorLocal);
      return;
    }

    setEstado('loading');
    setMensaje('');

    try {
      await authService.cambiarPassword(form.passwordActual, form.nuevaPassword);
      // El backend invalida la sesión actual (borra la cookie + tokenVersion++).
      // Hay que cerrar sesión en el cliente y mandar al login, si no la SPA
      // queda "logueada" en falso hasta el próximo 401.
      setEstado('ok');
      setMensaje('Contraseña actualizada. Volvé a iniciar sesión con la nueva contraseña.');
      setForm({ passwordActual: '', nuevaPassword: '', confirmarPassword: '' });
      setTimeout(async () => {
        await logout();
        navigate('/login', { replace: true });
      }, 1800);
    } catch (err) {
      setEstado('error');
      setMensaje(err.response?.data?.message ?? 'Error al cambiar la contraseña. Intentá de nuevo.');
    }
  }

  const fuerza = calcularFortalezaPassword(form.nuevaPassword);

  return (
    <div className="page-container">

      <PageHeader
        title="Seguridad de mi cuenta"
        subtitle="Actualizá tu contraseña de acceso al sistema."
      />

      <div className={styles.contenido}>
      {/* ── Card del formulario ── */}
      <div className={styles.card}>
        <form onSubmit={handleSubmit} noValidate>

          {/* Contraseña actual */}
          <div className={styles.fieldGroup}>
            <label htmlFor="passwordActual" className={styles.label}>
              Contraseña actual <span className={styles.required}>*</span>
            </label>
            <div className={styles.inputWrap}>
              <input
                id="passwordActual"
                name="passwordActual"
                type={mostrar.actual ? 'text' : 'password'}
                value={form.passwordActual}
                onChange={handleChange}
                placeholder="Tu contraseña actual"
                className={styles.input}
                autoComplete="current-password"
              />
              <button
                type="button"
                className={styles.toggleVer}
                onClick={() => toggleMostrar('actual')}
                aria-label={mostrar.actual ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                title={mostrar.actual ? 'Ocultar' : 'Ver'}
              >
                <Icon name={mostrar.actual ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
          </div>

          <div className={styles.divider} />

          {/* Nueva contraseña */}
          <div className={styles.fieldGroup}>
            <label htmlFor="nuevaPassword" className={styles.label}>
              Nueva contraseña <span className={styles.required}>*</span>
            </label>
            <div className={styles.inputWrap}>
              <input
                id="nuevaPassword"
                name="nuevaPassword"
                type={mostrar.nueva ? 'text' : 'password'}
                value={form.nuevaPassword}
                onChange={handleChange}
                placeholder={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
                minLength={PASSWORD_MIN_LENGTH}
                aria-describedby="ayuda-password"
                className={styles.input}
                autoComplete="new-password"
              />
              <button
                type="button"
                className={styles.toggleVer}
                onClick={() => toggleMostrar('nueva')}
                aria-label={mostrar.nueva ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                title={mostrar.nueva ? 'Ocultar' : 'Ver'}
              >
                <Icon name={mostrar.nueva ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>

            {/* Indicador de fortaleza */}
            {fuerza && (
              <div className={styles.fuerzaWrap}>
                <div className={styles.fuerzaBar}>
                  {[1, 2, 3, 4].map(n => (
                    <div
                      key={n}
                      className={styles.fuerzaSegmento}
                      style={{ background: n <= fuerza.nivel ? fuerza.color : 'var(--border)' }}
                    />
                  ))}
                </div>
                <span className={styles.fuerzaLabel} style={{ color: fuerza.color }}>
                  {fuerza.label}
                </span>
              </div>
            )}
          </div>

          {/* Confirmar nueva contraseña */}
          <div className={styles.fieldGroup}>
            <label htmlFor="confirmarPassword" className={styles.label}>
              Confirmar nueva contraseña <span className={styles.required}>*</span>
            </label>
            <div className={styles.inputWrap}>
              <input
                id="confirmarPassword"
                name="confirmarPassword"
                type={mostrar.confirmar ? 'text' : 'password'}
                value={form.confirmarPassword}
                onChange={handleChange}
                placeholder="Repetí la nueva contraseña"
                className={`${styles.input} ${
                  form.confirmarPassword && form.confirmarPassword !== form.nuevaPassword
                    ? styles.inputError
                    : ''
                }`}
                autoComplete="new-password"
              />
              <button
                type="button"
                className={styles.toggleVer}
                onClick={() => toggleMostrar('confirmar')}
                aria-label={mostrar.confirmar ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                title={mostrar.confirmar ? 'Ocultar' : 'Ver'}
              >
                <Icon name={mostrar.confirmar ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
            {form.confirmarPassword && form.confirmarPassword !== form.nuevaPassword && (
              <p className={styles.hintError}>Las contraseñas no coinciden.</p>
            )}
          </div>

          {/* Feedback */}
          {estado === 'ok' && (
            <div className={styles.alertOk} role="status">{mensaje}</div>
          )}
          {estado === 'error' && (
            <div className={styles.alertError} role="alert">{mensaje}</div>
          )}

          {/* Botón */}
          <button
            type="submit"
            id="btn-cambiar-password"
            className={`btn-primary ${styles.btnSubmit}`}
            disabled={estado === 'loading'}
          >
            <Icon name="lock" size={18} />
            {estado === 'loading' ? 'Cambiando...' : 'Cambiar contraseña'}
          </button>
        </form>
      </div>

      {/* Tip de seguridad */}
      <div className={styles.tip} id="ayuda-password">
        <Icon name="info" size={18} />
        <span>
          La contraseña debe tener al menos {PASSWORD_MIN_LENGTH} caracteres. Para que sea más segura,
          combiná letras, números y símbolos, y no reutilices la de otras plataformas.
        </span>
      </div>
      </div>
    </div>
  );
}
