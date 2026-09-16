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
          <Link to="/registro-empresa" className={styles.btnEmpresa}>
            {/* En mobile el texto completo no entra junto al botón de login
                (desbordaba la barra) — se acorta por CSS, no se recorta con
                overflow. */}
            <span className={styles.btnEmpresaFull}>🏢 Registrarse como empresa</span>
            <span className={styles.btnEmpresaShort}>🏢 Empresa</span>
          </Link>
          <Link to="/login" className={styles.btnLogin}>
            Iniciar Sesión
          </Link>
        </div>
      </div>
    </nav>
  );
}
