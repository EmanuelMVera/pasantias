/**
 * NavbarPublic.jsx — Barra de navegación para usuarios no autenticados.
 *
 * Se muestra en la página de inicio (HomePage) cuando el visitante
 * no ha iniciado sesión. Incluye:
 * - Logo y nombre del sistema
 * - Subtítulo "Portal de Empleo"
 * - Botón para ir al login
 *
 * Los estilos se cargan desde NavbarPublic.module.css (CSS Modules).
 */

import { Link } from 'react-router-dom';
import styles from './NavbarPublic.module.css';

export default function NavbarPublic() {
  return (
    <nav className={styles.navbarPublic}>
      <div className={styles.navbarPublicInner}>

        {/* Logo / Nombre del sistema — redirige al inicio al hacer clic */}
        <Link to="/" className={styles.navbarPublicBrand}>
          <span className={styles.brandIcon}>🎓</span>
          <div className={styles.brandText}>
            <span className={styles.brandTitle}>SisPasantías</span>
            <span className={styles.brandSubtitle}>Portal de Empleo</span>
          </div>
        </Link>

        {/* Acciones de la navbar pública */}
        <div className={styles.navbarPublicActions}>
          <Link to="/registro-empresa" className={styles.btnEmpresa} aria-label="Registrarse como empresa">
            {/* 3 niveles de texto según el ancho disponible — nunca se
                recorta con overflow, se acorta por CSS (≤640px / ≤360px).
                aria-label fija el nombre accesible en los 3 casos, incluso
                cuando el texto visible queda reducido al emoji. */}
            <span className={styles.btnEmpresaFull} aria-hidden="true">🏢 Registrarse como empresa</span>
            <span className={styles.btnEmpresaShort} aria-hidden="true">🏢 Empresa</span>
            <span className={styles.btnEmpresaMicro} aria-hidden="true">🏢</span>
          </Link>
          <Link to="/login" className={styles.btnLogin} aria-label="Iniciar sesión">
            <span className={styles.btnLoginFull} aria-hidden="true">Iniciar Sesión</span>
            <span className={styles.btnLoginShort} aria-hidden="true">Entrar</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
