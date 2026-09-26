import Icon from '../ui/Icon';
import { accionInfo, entidadLabel } from '../../pages/admin/auditoria.utils';
import styles from './ActividadFeed.module.css';

/**
 * ActividadFeed.jsx — timeline de actividad reciente (`limite` eventos como máximo).
 *
 * Todo sale del registro de auditoría real (/admin/actividad-reciente): la
 * etiqueta de la acción y de la entidad usan el mismo catálogo que la página de
 * Auditoría (auditoria.utils), así ambos lugares nombran igual cada evento.
 */

const ICONO_ENTIDAD = {
  usuario: 'user',
  empresa: 'building',
  oferta: 'briefcase',
  postulacion: 'send',
  solicitud_empresa: 'inbox',
  solicitud_reclutador: 'userPlus',
  activity_log: 'history',
  estadisticas: 'chart',
};

const ICONO_ACCION = { login: 'lock', logout: 'logout' };

function formatearFecha(iso) {
  if (!iso) return '';
  const fecha = new Date(iso);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  if (fecha.toDateString() === hoy.toDateString()) return `Hoy, ${hora}`;
  if (fecha.toDateString() === ayer.toDateString()) return `Ayer, ${hora}`;
  const dia = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: fecha.getFullYear() === hoy.getFullYear() ? undefined : 'numeric' });
  return `${dia}, ${hora}`;
}

export default function ActividadFeed({ actividad, limite = 10 }) {
  if (!actividad || actividad.length === 0) return (
    <p className="msg">No hay actividad reciente registrada.</p>
  );

  return (
    <ol className={styles.timeline}>
      {actividad.slice(0, limite).map((item) => {
        const info = accionInfo(item.accion);
        const icono = ICONO_ACCION[item.accion] ?? ICONO_ENTIDAD[item.entidad] ?? 'history';
        const autor = item.usuario ? `${item.usuario.nombre} ${item.usuario.apellido}` : 'Sistema';
        const entidad = item.entidad
          ? `${entidadLabel(item.entidad)}${item.entidadId ? ` #${item.entidadId}` : ''}`
          : null;
        return (
          <li
            key={item.id ?? `${item.accion}-${item.createdAt}`}
            className={styles.item}
            style={{ '--accion-color': info.color }}
          >
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.icon} aria-hidden="true"><Icon name={icono} size={18} /></span>
            <div className={styles.body}>
              <span className={styles.titulo}>
                {info.label}
                {entidad && <span className={styles.entidad}> · {entidad}</span>}
              </span>
              <span className={styles.meta}>por {autor}</span>
            </div>
            <time className={styles.fecha} dateTime={item.createdAt} title={item.createdAt ? new Date(item.createdAt).toLocaleString('es-AR') : undefined}>
              {formatearFecha(item.createdAt)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
