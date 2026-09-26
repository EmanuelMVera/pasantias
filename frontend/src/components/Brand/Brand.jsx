/**
 * Brand.jsx — Marca propia de SisPasantías (símbolo vectorial + nombre).
 *
 * Símbolo: un birrete (educación) sobre un maletín (empleo), unidos por la
 * borla que cuelga hasta el maletín (conexión alumno ↔ empresa). Es SVG en
 * código: sin imágenes, sin librerías de íconos, sin assets de terceros. El
 * fondo del símbolo es el azul institucional, así funciona tanto sobre el
 * navbar oscuro como sobre fondos claros; `tone` solo define el color del texto.
 *
 *   <Brand variant="full" tone="light" to="/" responsive />
 *
 * variant:
 *   full     → [símbolo] SisPasantías / Portal Institucional de Empleo
 *   compact  → [símbolo] SisPasantías
 *   mark     → [símbolo]
 * responsive: degrada por CSS (sin JS) full → compact (<1024px) → mark (≤400px).
 * tone: 'light' (texto claro, para fondos oscuros) | 'dark' (texto oscuro).
 * plainTagline: descriptor en minúscula tipo oración (sidebar del admin).
 */

import { Link } from 'react-router-dom';
import styles from './Brand.module.css';

export function BrandMark({ size = 36, className = '' }) {
  return (
    <svg
      className={`${styles.mark} ${className}`.trim()}
      viewBox="0 0 40 40"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="40" height="40" rx="10" style={{ fill: 'var(--primary, #0073AD)' }} />
      {/* Birrete */}
      <path d="M20 5 L35 11.5 L20 18 L5 11.5 Z" fill="#fff" />
      {/* Maletín: asa + cuerpo + cierre */}
      <path
        d="M16 23.5 v-2 a1.6 1.6 0 0 1 1.6-1.6 h4.8 a1.6 1.6 0 0 1 1.6 1.6 v2"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="9" y="23" width="22" height="11" rx="2.6" fill="#fff" />
      <rect x="17.5" y="26.6" width="5" height="2.6" rx="1" style={{ fill: 'var(--primary, #0073AD)' }} />
      {/* Vínculo: la borla del birrete cae hasta el nivel del maletín */}
      <path d="M34 12.4 V25" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="34" cy="26.4" r="1.9" fill="#fff" />
    </svg>
  );
}

export default function Brand({
  variant = 'full',
  tone = 'light',
  to,
  responsive = false,
  size = 36,
  className = '',
  onClick,
  plainTagline = false,
}) {
  const clases = [
    styles.brand,
    tone === 'dark' ? styles.dark : styles.light,
    responsive ? styles.responsive : '',
    plainTagline ? styles.plain : '',
    className,
  ].filter(Boolean).join(' ');

  const contenido = (
    <>
      <BrandMark size={size} />
      {variant !== 'mark' && (
        <span className={styles.text}>
          <span className={styles.name}>SisPasantías</span>
          {variant === 'full' && (
            <span className={styles.tagline}>
              {plainTagline ? 'Portal institucional de empleo' : 'Portal Institucional de Empleo'}
            </span>
          )}
        </span>
      )}
    </>
  );

  return to ? (
    <Link to={to} className={clases} aria-label="SisPasantías" onClick={onClick}>{contenido}</Link>
  ) : (
    <span className={clases} role="img" aria-label="SisPasantías">{contenido}</span>
  );
}
