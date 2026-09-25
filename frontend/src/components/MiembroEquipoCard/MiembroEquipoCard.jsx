import Avatar from '../Avatar/Avatar';
import styles from './MiembroEquipoCard.module.css';

const ROL_COLORS = { admin_empresa: '#7c3aed', reclutador: '#0891b2' };
function rolColor(rol) { return ROL_COLORS[rol] ?? '#64748b'; }

function formatFecha(iso) {
  if (!iso) return 'Nunca';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ── Tarjeta de miembro ─────────────────────────────────────────────────────── */
// La fila del admin_empresa muestra identidad INSTITUCIONAL (logo + razón
// social) — la empresa es una entidad, no una persona (feedback de la
// profesora). El responsable humano queda como dato secundario, igual al
// patrón ya usado en Navbar.jsx. Los reclutadores siguen mostrándose como
// personas (foto + nombre propio) — eso no cambia.
export default function MiembroEquipoCard({ miembro, empresa, esPropietario, onToggleActivo, onEliminar, onRecuperacion }) {
  const u = miembro.usuario ?? miembro;
  const esProp = miembro.rolInterno === 'admin_empresa';
  const nombre = esProp
    ? (empresa?.razonSocial || `${u.nombre ?? ''} ${u.apellido ?? ''}`.trim())
    : (`${u.nombre ?? ''} ${u.apellido ?? ''}`.trim() || u.email);

  return (
    <div className={`${styles.miembroCard} ${!miembro.activo ? styles.miembroInactivo : ''}`}>
      <Avatar
        src={esProp ? (empresa?.logo || null) : u.fotoPerfil}
        nombre={esProp ? (empresa?.razonSocial || u.nombre) : u.nombre}
        apellido={esProp ? '' : u.apellido}
        size={44}
        color={rolColor(miembro.rolInterno)}
        style={{ fontWeight: 800 }}
      />
      <div className={styles.cardInfo}>
        <div className={styles.cardNombre}>
          <strong>{nombre}</strong>
          {esProp && <span className={styles.propietarioBadge}>Administrador de empresa</span>}
          {!miembro.activo && <span className={styles.suspendidoBadge}>Suspendido</span>}
        </div>
        {esProp && (
          <span className={styles.cardEmail}>
            Responsable de cuenta: {u.nombre} {u.apellido}
          </span>
        )}
        <span className={styles.cardEmail}>{u.email}</span>
        <div className={styles.cardMeta}>
          <span className={styles.cardFecha}>Último acceso: {formatFecha(u.ultimoAcceso)}</span>
        </div>
      </div>
      {esPropietario && !esProp && (
        <div className={styles.cardAcciones}>
          <button
            className={`${styles.btnAccion} ${miembro.activo ? styles.btnWarning : styles.btnOk}`}
            onClick={() => onToggleActivo(miembro)}
          >
            {miembro.activo ? '⏸ Suspender' : '▶ Reactivar'}
          </button>
          <button
            className={styles.btnAccion}
            onClick={() => onRecuperacion(miembro)}
          >
            🔑 Enviar recuperación de acceso
          </button>
          <button
            className={`${styles.btnAccion} ${styles.btnDanger}`}
            onClick={() => onEliminar(miembro)}
          >
            🗑️ Quitar del equipo
          </button>
        </div>
      )}
    </div>
  );
}
