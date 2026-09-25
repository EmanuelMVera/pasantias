import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import styles from './LoginPage.module.css';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [devToken, setDevToken] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    setDevToken('');
    setLoading(true);
    try {
      const { data } = await authService.forgotPassword(email);
      setMsg(data.message);
      if (data.devToken) setDevToken(data.devToken);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al procesar la solicitud.');
    } finally {
      setLoading(false);
    }
  };

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
            <h1 className={styles.authSubtitle}>Recuperar contraseña</h1>
            <p className={styles.authDesc}>
              Ingresá tu email y te enviaremos un link para restablecer tu contraseña.
            </p>
            <div className={styles.authDivider} />
          </div>

          {!msg ? (
            <form onSubmit={handleSubmit} className={styles.authForm}>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                />
              </div>

              {error && <p className="error-msg">{error}</p>}

              <button
                type="submit"
                className={`btn-primary ${styles.authSubmit}`}
                disabled={loading}
              >
                {loading ? 'Enviando...' : 'Enviar instrucciones'}
              </button>
            </form>
          ) : (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✉️</div>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>{msg}</p>

              {/* Solo en desarrollo cuando no hay email configurado */}
              {devToken && (
                <Link
                  to={`/reset-password/${devToken}`}
                  className="btn-primary"
                  style={{ display: 'inline-block', textAlign: 'center', marginTop: '0.5rem' }}
                >
                  Ir a restablecer contraseña →
                </Link>
              )}
            </div>
          )}

          <div className={`${styles.authDivider} ${styles.authDividerBottom}`} />

          <p className={`${styles.authLink} ${styles.authRegister}`}>
            <Link to="/login">← Volver al inicio de sesión</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
