import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getRutaInicio } from '../../utils/rutas';
import styles from './LoginPage.module.css';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', remember: false, });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Buscamos si hay un email guardado en localStorage para autocompletar el campo y marcar "Recordarme"
  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setForm((prev) => ({
        ...prev,
        email: savedEmail,
        remember: true, // También marcamos el checkbox para que sepa que está activo
      }));
    }
  }, []);

  //Nuevo Abril
  const handleBack = () => {
    navigate("/");
  }

  // Credenciales de demo para la presentación. Al hacer clic se autocompleta
  // el formulario (misma contraseña para los 4 usuarios del escenario demo).
  const DEMO_PASSWORD = 'Demo1234!';
  const DEMO_CUENTAS = [
    { rol: 'Admin del sistema', email: 'sistema@demo.com' },
    { rol: 'Admin de empresa', email: 'empresa@demo.com' },
    { rol: 'Reclutador', email: 'reclutador@demo.com' },
    { rol: 'Alumno / Egresado', email: 'alumno@demo.com' },
  ];

  const usarCuentaDemo = (email) => {
    setForm((prev) => ({ ...prev, email, password: DEMO_PASSWORD }));
    setError('');
  };

  // const handleChange = (e) =>
  //   setForm({ ...form, [e.target.name]: e.target.value });
  //Modificacion Abril
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const usuario = await login(form.email, form.password);

      // --- LÓGICA DE RECORDARME ---
      if (form.remember) {
        localStorage.setItem('rememberedEmail', form.email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }
      // ----------------------------

      navigate(getRutaInicio(usuario.rol), { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Error al iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className={styles.authLayout}>
        {/* Top bar desktop */}
        <header className={styles.authTopbar}>
          <button
            type="button"
            className={styles.authBack}
            onClick={handleBack}
          >
            <span className={styles.authBackIcon}>←</span>
            <span>volver</span>
          </button>

          <img
            src="/logo1-itb.png"
            alt="Instituto Tecnológico Beltrán"
            className={styles.authTopLogo}
          />
        </header>

        <main className={`${styles.authContainer} ${styles.authContainer}`}>
          <div className={`${styles.authCard} ${styles.authCardWireframe}`}>
            {/* Logo mobile */}
            <img
              src="/logo1-itb.png"
              alt="Instituto Tecnológico Beltrán"
              className={styles.authLogoMobile}
            />

            <div className={styles.authHeader}>
              <h1 className={styles.authSubtitle}>Inicia Sesión</h1>
              <p className={styles.authDesc}>Accedé a tu cuenta</p>
              <div className={styles.authDivider} />
            </div>

            <form
              onSubmit={handleSubmit}
              className={styles.authForm}
            >
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Contraseña</label>

                <div className={styles.passwordInputWrapper}>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    required
                  />

                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={
                      showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                    }
                  >
                    {showPassword ? (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12c.92-2.6 2.63-4.8 4.86-6.32" />
                        <path d="M10.58 10.58a2 2 0 1 0 2.83 2.83" />
                        <path d="M1 1l22 22" />
                        <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a11.05 11.05 0 0 1-3.17 4.59" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className={styles.authOptions}>
                <label className={styles.rememberCheckbox}>
                  <input
                    type="checkbox"
                    name="remember"
                    checked={form.remember}
                    onChange={handleChange}
                  />
                  <span>Recordarme</span>
                </label>

                <Link
                  to="/forgot-password"
                  className={styles.forgotLink}
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>

              {error && <p className="error-msg">{error}</p>}

              <button
                type="submit"
                className={`btn-primary ${styles.authSubmit}`}
                disabled={loading}
              >
                {loading ? 'Ingresando...' : 'INGRESAR'}
              </button>
            </form>

            <div className={`${styles.authDivider} ${styles.authDividerBottom}`} />

            <p className={`${styles.authLink} ${styles.authRegister}`}>
              ¿No tenés cuenta?{' '}
              <Link to="/registro-empresa">
                Registrarse
              </Link>
            </p>

            {/* Cuadro de credenciales para la demo / presentación */}
            <div className={styles.demoBox}>
              <p className={styles.demoBoxTitle}>Cuentas de demo</p>
              <ul className={styles.demoList}>
                {DEMO_CUENTAS.map((c) => (
                  <li key={c.email}>
                    <button
                      type="button"
                      className={styles.demoItem}
                      onClick={() => usarCuentaDemo(c.email)}
                      title="Usar esta cuenta"
                    >
                      <span className={styles.demoRol}>{c.rol}</span>
                      <span className={styles.demoEmail}>{c.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className={styles.demoBoxHint}>
                Contraseña para las 4: <code>{DEMO_PASSWORD}</code>
              </p>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}