/**
 * HomePage.jsx — Landing page pública de SisPasantías.
 *
 * Primera pantalla que ven los visitantes no autenticados.
 * Incluye animación de partículas tipo vórtice, secciones de
 * presentación del sistema y llamada a la acción para empresas.
 *
 * Ruta: /
 * Acceso: público (sin autenticación requerida)
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import NavbarPublic from '../components/NavbarPublic/NavbarPublic';
import styles from './HomePage.module.css';

// ── Componente de partículas animadas ──────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let animationId;
    let particles = [];
    const COUNT = 180;

    // Paleta de colores del sistema institucional
    const COLORS = [
      '#0073AD', // --primary
      '#58ACFA', // --accent
      '#2D3E50', // --secondary
      '#005a87', // --primary-dark
      '#3d8fc9',
      '#7ec8f0',
      '#1a4f70',
      '#a0d4f5',
    ];

    function resize() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }

    function createParticle() {
      const angle = Math.random() * Math.PI * 2;
      const radius = 80 + Math.random() * 320;
      const z = Math.random() * 2 - 1; // -1 a 1 (profundidad)
      const speed = (0.002 + Math.random() * 0.004) * (Math.random() > 0.5 ? 1 : -1);
      return {
        angle,
        radius,
        z,
        speed,
        size: 1.5 + Math.random() * 3,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        opacity: 0.3 + Math.random() * 0.7,
        tailLength: 4 + Math.random() * 14,
      };
    }

    function init() {
      resize();
      particles = Array.from({ length: COUNT }, () => createParticle());
    }

    function draw() {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(p => {
        p.angle += p.speed;

        // Proyección 3D simple: z afecta tamaño y opacidad
        const perspective = (p.z + 2) / 3; // 0.33 a 1
        const x = cx + Math.cos(p.angle) * p.radius * perspective;
        const y = cy + Math.sin(p.angle) * p.radius * 0.38 * perspective;

        const size = p.size * perspective;
        const alpha = p.opacity * perspective;

        // Dibujar la cola de la partícula
        const tailAngle = p.angle - p.speed * p.tailLength;
        const tx = cx + Math.cos(tailAngle) * p.radius * perspective;
        const ty = cy + Math.sin(tailAngle) * p.radius * 0.38 * perspective;

        const grad = ctx.createLinearGradient(tx, ty, x, y);
        grad.addColorStop(0, `${p.color}00`);
        grad.addColorStop(1, `${p.color}${Math.floor(alpha * 255).toString(16).padStart(2, '0')}`);

        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Punto brillante al final
        ctx.beginPath();
        ctx.arc(x, y, size * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${Math.floor(alpha * 255).toString(16).padStart(2, '0')}`;
        ctx.fill();
      });

      animationId = requestAnimationFrame(draw);
    }

    init();
    draw();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.particleCanvas} />;
}

// ── Componente de tarjeta de beneficio ────────────────────────────────────
function BenefitCard({ icon, title, items, delay }) {
  return (
    <div className={styles.benefitCard} style={{ animationDelay: `${delay}ms` }}>
      <div className={styles.benefitIcon}>{icon}</div>
      <h3 className={styles.benefitTitle}>{title}</h3>
      <ul className={styles.benefitList}>
        {items.map((item, i) => (
          <li key={i} className={styles.benefitItem}>
            <span className={styles.benefitCheck}>✓</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Componente de paso del proceso ─────────────────────────────────────────
function StepCard({ number, title, description, delay }) {
  return (
    <div className={styles.stepCard} style={{ animationDelay: `${delay}ms` }}>
      <div className={styles.stepNumber}>{number}</div>
      <h3 className={styles.stepTitle}>{title}</h3>
      <p className={styles.stepDescription}>{description}</p>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────
export default function HomePage() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Pequeño delay para que la animación de entrada se active
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={styles.homePage}>
      <NavbarPublic />

      {/* ── Hero Section ────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <ParticleCanvas />

        <div className={`${styles.heroContent} ${visible ? styles.heroVisible : ''}`}>
          <div className={styles.heroBadge}>
            <span className={styles.heroBadgeDot} />
            Instituto Tecnológico Beltrán
          </div>

          <h1 className={styles.heroTitle}>
            Conectando <span className={styles.heroTitleAccent}>talento</span>
            <br />
            con oportunidades reales
          </h1>

          <p className={styles.heroSubtitle}>
            SisPasantías es la plataforma institucional que vincula a alumnos y egresados del
            Instituto con empresas que buscan incorporar talento profesional.
          </p>

          <div className={styles.heroActions}>
            <Link to="/registro-empresa" className={styles.btnPrimary}>
              🏢 Registrar mi empresa
            </Link>
            <Link to="/login" className={styles.btnSecondary}>
              Iniciar sesión →
            </Link>
          </div>
        </div>

        <div className={styles.heroScrollIndicator}>
          <div className={styles.scrollArrow} />
        </div>
      </section>

      {/* ── Sección: Cómo funciona ──────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionBadge}>Proceso simple</span>
            <h2 className={styles.sectionTitle}>¿Cómo funciona para las empresas?</h2>
            <p className={styles.sectionSubtitle}>
              En pocos pasos empezás a recibir postulaciones de candidatos calificados del instituto.
            </p>
          </div>

          <div className={styles.stepsGrid}>
            <StepCard
              number="01"
              title="Registrá tu empresa"
              description="Completá el formulario con los datos de tu empresa. Un administrador del instituto revisará y aprobará tu solicitud."
              delay={0}
            />
            <StepCard
              number="02"
              title="Publicá tus ofertas"
              description="Creá ofertas de pasantía detallando el puesto, requisitos, modalidad y remuneración. El sistema las muestra a los alumnos."
              delay={100}
            />
            <StepCard
              number="03"
              title="Gestioná candidatos"
              description="Revisá los perfiles de quienes se postulan, cambiá su estado y coordiná el proceso de selección directamente desde el portal."
              delay={200}
            />
            <StepCard
              number="04"
              title="Incorporá al pasante"
              description="Una vez elegido el candidato, formalizá la incorporación y gestioná el seguimiento de la pasantía desde el sistema."
              delay={300}
            />
          </div>
        </div>
      </section>

      {/* ── Sección: Beneficios ─────────────────────────────────────────── */}
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionBadge}>¿Por qué elegirnos?</span>
            <h2 className={styles.sectionTitle}>Beneficios para tu empresa</h2>
            <p className={styles.sectionSubtitle}>
              Accedé a un pool de candidatos formados institucionalmente y gestioná todo el proceso
              desde un solo lugar.
            </p>
          </div>

          <div className={styles.benefitsGrid}>
            <BenefitCard
              icon="🎯"
              title="Candidatos calificados"
              delay={0}
              items={[
                'Alumnos y egresados del instituto',
                'Perfiles verificados institucionalmente',
                'CV completo y actualizado',
                'Búsqueda y filtrado de postulantes',
              ]}
            />
            <BenefitCard
              icon="⚡"
              title="Gestión eficiente"
              delay={100}
              items={[
                'Revisión de postulaciones en un solo lugar',
                'Mensajería directa integrada',
                'Notificaciones en tiempo real',
                'Gestión de equipo de reclutadores',
              ]}
            />
            <BenefitCard
              icon="🏛️"
              title="Respaldo institucional"
              delay={200}
              items={[
                'Seguimiento institucional del proceso',
                'Marco legal de pasantías',
                'Gestión centralizada de documentación',
                'Historial y trazabilidad completa',
              ]}
            />
          </div>
        </div>
      </section>

      {/* ── CTA Final ──────────────────────────────────────────────────── */}
      <section className={styles.ctaSection}>
        <ParticleCanvas />
        <div className={styles.ctaContent}>
          <h2 className={styles.ctaTitle}>¿Tu empresa busca talento joven?</h2>
          <p className={styles.ctaSubtitle}>
            Registrate hoy y empezá a conectar con los mejores alumnos y egresados del
            Instituto Tecnológico Beltrán.
          </p>
          <Link to="/registro-empresa" className={styles.ctaBtn}>
            🏢 Registrar mi empresa ahora
          </Link>
          <p className={styles.ctaNote}>
            ¿Ya tenés cuenta?{' '}
            <Link to="/login" className={styles.ctaNoteLink}>
              Iniciá sesión aquí
            </Link>
          </p>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <span className={styles.footerIcon}>🎓</span>
            <div>
              <div className={styles.footerTitle}>SisPasantías</div>
              <div className={styles.footerSub}>Instituto Tecnológico Beltrán</div>
            </div>
          </div>
          <div className={styles.footerLinks}>
            <Link to="/login" className={styles.footerLink}>Iniciar sesión</Link>
            <Link to="/registro-empresa" className={styles.footerLink}>Registrar empresa</Link>
          </div>
          <div className={styles.footerCopy}>
            © {new Date().getFullYear()} Instituto Tecnológico Beltrán. Todos los derechos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}
