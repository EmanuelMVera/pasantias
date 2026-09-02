/**
 * SeguridadPage.jsx — Página de seguridad de cuenta para usuarios empresa/reclutador.
 *
 * Permite cambiar la contraseña actual verificando que conoce la contraseña vigente.
 * Disponible para todos los roles autenticados.
 *
 * Ruta: /empresa/seguridad
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { calcularFortalezaPassword } from '../../utils/passwordStrength';
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
    if (form.nuevaPassword.length < 6) return 'La nueva contraseña debe tener al menos 6 caracteres.';
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
      setMensaje('✅ Contraseña actualizada. Volvé a iniciar sesión con la nueva contraseña.');
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
    <div className="page-container" style={{ maxWidth: 560 }}>

      {/* ── Cabecera ── */}
      <div className="dashboard-header" style={{ marginBottom: '2rem' }}>
        <div>
          <Link to="/empresa" className="btn-back">← Volver al panel</Link>
          <h1 style={{ marginTop: '0.5rem' }}>🔐 Seguridad de la cuenta</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: '0.25rem' }}>
            Actualizá tu contraseña de acceso al sistema.
          </p>
        </div>
      </div>

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
                title={mostrar.actual ? 'Ocultar' : 'Ver'}
              >
                {mostrar.actual ? '🙈' : '👁️'}
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
                placeholder="Mínimo 6 caracteres"
                className={styles.input}
                autoComplete="new-password"
              />
              <button
                type="button"
                className={styles.toggleVer}
                onClick={() => toggleMostrar('nueva')}
                title={mostrar.nueva ? 'Ocultar' : 'Ver'}
              >
                {mostrar.nueva ? '🙈' : '👁️'}
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
                title={mostrar.confirmar ? 'Ocultar' : 'Ver'}
              >
                {mostrar.confirmar ? '🙈' : '👁️'}
              </button>
            </div>
            {form.confirmarPassword && form.confirmarPassword !== form.nuevaPassword && (
              <p className={styles.hintError}>Las contraseñas no coinciden.</p>
            )}
          </div>

          {/* Feedback */}
          {estado === 'ok' && (
            <div className={styles.alertOk}>{mensaje}</div>
          )}
          {estado === 'error' && (
            <div className={styles.alertError}>⚠️ {mensaje}</div>
          )}

          {/* Botón */}
          <button
            type="submit"
            id="btn-cambiar-password"
            className={`btn-primary ${styles.btnSubmit}`}
            disabled={estado === 'loading'}
          >
            {estado === 'loading' ? '⏳ Cambiando...' : '🔐 Cambiar contraseña'}
          </button>
        </form>
      </div>

      {/* Tip de seguridad */}
      <div className={styles.tip}>
        <span>💡</span>
        <span>
          Usá una contraseña de al menos 8 caracteres combinando letras, números y símbolos.
          No uses la misma contraseña que en otras plataformas.
        </span>
      </div>
    </div>
  );
}
