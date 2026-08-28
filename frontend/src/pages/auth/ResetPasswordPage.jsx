import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authService } from '../../services/api';
import { calcularFortalezaPassword } from '../../utils/passwordStrength';
import styles from './LoginPage.module.css';

export default function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    if (password !== confirm) return setError('Las contraseñas no coinciden.');

    setLoading(true);
    try {
      const { data } = await authService.resetPassword(token, password);
      setSuccess(data.message);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al restablecer la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  const fuerza = calcularFortalezaPassword(password);

  return (
    <div className={styles.authLayout}>
      {/* Top bar */}
      <header className={styles.authTopbar}>
        <button type="button" className={styles.authBack} onClick={() => navigate('/login')}>
          <span className={styles.authBackIcon}>←</span>
          <span>volver</span>
        </button>
        <img
          src="/logo1-itb.png"
          alt="Instituto Tecnológico Beltrán"
          className={styles.authTopLogo}
        />
      </header>

      <main className={styles.authContainer}>
        <div className={`${styles.authCard} ${styles.authCardWireframe}`}>
          {/* Logo mobile */}
          <img
            src="/logo1-itb.png"
            alt="Instituto Tecnológico Beltrán"
            className={styles.authLogoMobile}
          />

          <div className={styles.authHeader}>
            <h1 className={styles.authSubtitle}>Nueva contraseña</h1>
            <p className={styles.authDesc}>Elegí una contraseña segura para tu cuenta.</p>
            <div className={styles.authDivider} />
          </div>

          {success ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
              <p style={{ fontWeight: 600, color: 'var(--success, #10b981)', marginBottom: '0.5rem' }}>{success}</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                Redirigiendo al login en 3 segundos...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className={styles.authForm}>
              {/* Nueva contraseña */}
              <div className="form-group">
                <label htmlFor="password">Nueva contraseña</label>
                <div className={styles.passwordInputWrapper}>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                  />
                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setShowPassword((p) => !p)}
                    aria-label={showPassword ? 'Ocultar' : 'Mostrar'}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12c.92-2.6 2.63-4.8 4.86-6.32" />
                        <path d="M10.58 10.58a2 2 0 1 0 2.83 2.83" />
                        <path d="M1 1l22 22" />
                        <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a11.05 11.05 0 0 1-3.17 4.59" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {/* Indicador de fortaleza */}
                {fuerza && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
                    <div style={{ flex: 1, height: 4, borderRadius: 4, background: fuerza.color }} />
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {fuerza.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Confirmar contraseña */}
              <div className="form-group">
                <label htmlFor="confirm">Confirmar contraseña</label>
                <div className={styles.passwordInputWrapper}>
                  <input
                    id="confirm"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repetí la contraseña"
                    required
                  />
                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setShowConfirm((p) => !p)}
                    aria-label={showConfirm ? 'Ocultar' : 'Mostrar'}
                  >
                    {showConfirm ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12c.92-2.6 2.63-4.8 4.86-6.32" />
                        <path d="M10.58 10.58a2 2 0 1 0 2.83 2.83" />
                        <path d="M1 1l22 22" />
                        <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a11.05 11.05 0 0 1-3.17 4.59" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && <p className="error-msg">{error}</p>}

              <button
                type="submit"
                className={`btn-primary ${styles.authSubmit}`}
                disabled={loading}
              >
                {loading ? 'Guardando...' : 'Restablecer contraseña'}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
