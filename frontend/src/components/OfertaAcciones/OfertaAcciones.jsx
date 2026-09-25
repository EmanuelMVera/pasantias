import { Link } from 'react-router-dom';
import styles from './OfertaAcciones.module.css';

/**
 * Acciones de una oferta en el dashboard de empresa (editar / pausar / cerrar /
 * activar), según permisos y estado de ciclo de vida. Devuelve un fragmento:
 * el contenedor (celda de tabla o footer de card) lo pone la página.
 *
 * Los permisos ya vienen resueltos por la página (`puedeEditar`,
 * `puedeGestionar`) — este componente solo decide qué mostrar.
 */
export default function OfertaAcciones({ oferta: o, guardando, puedeEditar, puedeGestionar, onCambiarEstado }) {
  const editarBtn = puedeEditar && (
    <Link to={`/empresa/ofertas/${o.id}/editar`} className="btn-small" aria-label={`Editar la oferta "${o.titulo}"`}>
      ✏️ Editar
    </Link>
  );

  if (guardando) {
    return <>{editarBtn}<span className={styles.guardandoSpan}>Guardando...</span></>;
  }
  if (!puedeGestionar) {
    return (
      <>
        {editarBtn}
        <span className={styles.estadoNota} title="Solo el reclutador responsable puede modificar el estado de esta oferta.">
          Solo el responsable
        </span>
      </>
    );
  }
  if (o.estado === 'activa') {
    return (
      <>
        {editarBtn}
        <button className="btn-warn" onClick={() => onCambiarEstado(o.id, 'pausada')} aria-label={`Pausar la oferta "${o.titulo}"`}>
          Pausar
        </button>
        <button className="btn-danger" onClick={() => onCambiarEstado(o.id, 'cerrada')} aria-label={`Cerrar la oferta "${o.titulo}"`}>
          Cerrar
        </button>
      </>
    );
  }
  if (o.estado === 'pausada') {
    return (
      <>
        {editarBtn}
        <button className="btn-ok" onClick={() => onCambiarEstado(o.id, 'activa')} aria-label={`Activar la oferta "${o.titulo}"`}>
          Activar
        </button>
      </>
    );
  }
  // cerrada
  return <>{editarBtn}<span className={styles.estadoNota}>—</span></>;
}
