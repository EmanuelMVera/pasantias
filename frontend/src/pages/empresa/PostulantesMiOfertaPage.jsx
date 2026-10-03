/**
 * PostulantesMiOfertaPage.jsx — Proceso de selección de una oferta.
 *
 * Ruta: /empresa/postulantes/:ofertaId   (filtro en la URL: ?estado=entrevista)
 * Consume: GET /api/postulaciones/oferta/:id
 *
 * Dos lecturas de la misma pantalla — la autoridad es el backend
 * (`puedeGestionar` y `transicionesPermitidas` vienen en la respuesta):
 *
 *   - Reclutador RESPONSABLE: es su mesa de trabajo. Cambia el estado de cada
 *     candidato (solo las transiciones que el backend permite), deja una nota
 *     interna, consulta el historial y escribe por chat cuando el estado lo
 *     habilita.
 *   - Administrador de empresa: supervisión. Ve lo mismo (incluida la nota
 *     interna y el historial) sin ninguna acción sobre los candidatos.
 *
 * Un reclutador que no es el responsable (o una oferta sin responsable
 * asignado) recibe 403 del backend: se le explica y se lo devuelve a sus ofertas.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { postulacionService } from '../../services/postulacion.service';
import { abrirArchivoPrivado } from '../../services/api';
import { useEmpresa } from '../../hooks/useEmpresa';
import { useToast } from '../../hooks/useToast';
import Avatar from '../../components/Avatar/Avatar';
import Paginacion from '../../components/Paginacion/Paginacion';
import FilterGroup from '../../components/ui/FilterGroup';
import ActionMenu from '../../components/ui/ActionMenu';
import ConfirmModal from '../../components/ui/ConfirmModal';
import EmptyState from '../../components/ui/EmptyState';
import Toast from '../../components/ui/Toast';
import Icon from '../../components/ui/Icon';
import NotaInternaModal from '../../components/NotaInternaModal/NotaInternaModal';
import HistorialPostulacionModal from '../../components/HistorialPostulacionModal/HistorialPostulacionModal';
import { ESTADOS_HABILITAN_CHAT, getEstadoInfo, normalizarEstado } from '../../constants/postulacionEstados';
import { ESTADO_LABEL, ESTADO_TONO, MODERACION_LABEL, MODERACION_TONO } from '../../utils/ofertaEstados';
import styles from './PostulantesMiOfertaPage.module.css';

const FILTROS = [
  { value: '', label: 'Todos' },
  { value: 'en_revision', label: 'En revisión' },
  { value: 'preseleccionado', label: 'Preseleccionados' },
  { value: 'entrevista', label: 'Entrevista' },
  { value: 'contratado', label: 'Contratados' },
  { value: 'rechazado', label: 'No seleccionados' },
];

// Estados que se le comunican al candidato con un aviso fuerte: piden confirmación.
const CONFIRMAR = {
  contratado: {
    titulo: 'Contratar candidato',
    boton: 'Contratar',
    tono: 'ok',
    texto: 'Se le va a avisar que fue seleccionado. "Contratado" es el estado final del proceso: después no se puede cambiar.',
  },
  rechazado: {
    titulo: 'No seleccionar candidato',
    boton: 'No seleccionar',
    tono: 'danger',
    texto: 'Se le va a avisar que no fue seleccionado. Si fue un error, después podés reabrir la postulación.',
  },
};

/** Texto de la acción para pasar de `desde` a `hasta` (transiciones que define el backend). */
function etiquetaTransicion(desde, hasta) {
  if (hasta === 'preseleccionado') return desde === 'entrevista' ? 'Volver a preseleccionado' : 'Preseleccionar';
  if (hasta === 'entrevista') return 'Pasar a entrevista';
  if (hasta === 'contratado') return 'Contratar';
  if (hasta === 'rechazado') return 'No seleccionar';
  if (hasta === 'en_revision') return desde === 'rechazado' ? 'Reabrir postulación' : 'Volver a en revisión';
  return getEstadoInfo(hasta).label;
}

function formatFecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function EstadoBadge({ estado }) {
  const info = getEstadoInfo(estado);
  return (
    <span className={`badge badge-tone-${info.tone}`}>
      <Icon name={info.icon} size={14} strokeWidth={2} />
      {info.label}
    </span>
  );
}

/** Coincidencia entre las habilidades del candidato y las que pide la oferta (dato del backend). */
function Compatibilidad({ valor }) {
  const pct = Math.min(Math.max(Number(valor) || 0, 0), 100);
  const tono = pct >= 75 ? styles.compatAlta : pct >= 50 ? styles.compatMedia : styles.compatBaja;
  return (
    <span className={styles.compat} title="Habilidades del candidato que coinciden con las que pide la oferta">
      <span className={styles.compatBarra} aria-hidden="true">
        <span className={`${styles.compatRelleno} ${tono}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={styles.compatTexto}>{pct}% de coincidencia</span>
    </span>
  );
}

export default function PostulantesMiOfertaPage() {
  const { ofertaId } = useParams();
  const { esAdminEmpresa } = useEmpresa();
  const { toast, showToast } = useToast(3500);

  const [params, setParams] = useSearchParams();
  const filtro = params.get('estado') ?? '';
  const setFiltro = (valor) => setParams(valor ? { estado: valor } : {}, { replace: true });

  const [postulaciones, setPostulaciones] = useState([]);
  const [oferta, setOferta] = useState(null);
  const [puedeGestionar, setPuedeGestionar] = useState(false);
  const [pagination, setPagination] = useState(null);
  const [conteoPorEstado, setConteoPorEstado] = useState({});
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // { mensaje, sinAcceso }
  const [procesando, setProcesando] = useState(null); // id de la postulación en curso
  const [confirmar, setConfirmar] = useState(null); // { postulacion, estado }
  const [notaDe, setNotaDe] = useState(null);
  const [historialDe, setHistorialDe] = useState(null);

  const cargar = useCallback(async (pagina = 1) => {
    setLoading(true);
    try {
      const consulta = { page: pagina, limit: 20 };
      if (filtro) consulta.estado = filtro;
      const { data } = await postulacionService.getByOferta(ofertaId, consulta);
      setPostulaciones(data.data ?? []);
      setOferta(data.oferta ?? null);
      setPuedeGestionar(Boolean(data.puedeGestionar));
      setPagination(data.pagination ?? null);
      setConteoPorEstado(data.conteoPorEstado ?? {});
      setPage(pagina);
      setError(null);
    } catch (err) {
      setError({
        mensaje: err.response?.data?.message ?? 'No se pudo cargar el proceso.',
        sinAcceso: err.response?.status === 403 || err.response?.status === 404,
      });
    } finally {
      setLoading(false);
    }
  }, [ofertaId, filtro]);

  useEffect(() => { cargar(1); }, [cargar]);

  const cambiarEstado = async (postulacion, nuevoEstado) => {
    setProcesando(postulacion.id);
    try {
      await postulacionService.updateEstado(postulacion.id, nuevoEstado);
      const nombre = `${postulacion.usuario?.nombre ?? ''} ${postulacion.usuario?.apellido ?? ''}`.trim();
      showToast(`${nombre || 'Candidato'}: ${getEstadoInfo(nuevoEstado).label}.`, 'success');
    } catch (err) {
      showToast(err.response?.data?.message ?? 'No se pudo cambiar el estado.', 'error');
    } finally {
      setProcesando(null);
      setConfirmar(null);
      cargar(page); // la lista, los contadores y las transiciones salen del backend
    }
  };

  const pedirCambio = (postulacion, estado) => {
    if (CONFIRMAR[estado]) setConfirmar({ postulacion, estado });
    else cambiarEstado(postulacion, estado);
  };

  const notaGuardada = (mensaje) => {
    setNotaDe(null);
    showToast(mensaje, 'success');
    cargar(page);
  };

  const volver = esAdminEmpresa
    ? { to: '/empresa/candidatos', label: 'Volver a candidatos' }
    : { to: '/empresa/ofertas', label: 'Volver a mis ofertas' };

  const enlaceVolver = (
    <Link to={volver.to} className={styles.volver}>
      <Icon name="arrowLeft" size={16} /> {volver.label}
    </Link>
  );

  // Sin acceso (otro reclutador es el responsable, o la oferta no tiene uno).
  if (error?.sinAcceso) {
    return (
      <div className="page-container">
        {enlaceVolver}
        <EmptyState iconName="lock" title="No podés gestionar este proceso." hint={error.mensaje}>
          <Link to={volver.to} className="btn-primary">{volver.label}</Link>
        </EmptyState>
      </div>
    );
  }

  const total = Object.values(conteoPorEstado).reduce((a, b) => a + b, 0);
  const opciones = FILTROS.map((f) => ({
    value: f.value,
    label: `${f.label} (${f.value === '' ? total : (conteoPorEstado[f.value] ?? 0)})`,
  }));
  const responsable = oferta?.creadaPor ? `${oferta.creadaPor.nombre} ${oferta.creadaPor.apellido}` : null;
  const moderacionEnCurso = oferta && oferta.estadoModeracion === 'pendiente';
  const moderacionRechazada = oferta && oferta.estadoModeracion === 'rechazada';

  return (
    <div className="page-container">
      <Toast toast={toast} />

      {/* ── Cabecera del proceso ─────────────────────────────────────────── */}
      <header className={styles.cabecera}>
        <div className={styles.cabeceraTexto}>
          {enlaceVolver}
          <h1 className={styles.titulo}>{oferta?.titulo ?? 'Proceso de selección'}</h1>
          {oferta && (
            <div className={styles.meta}>
              <span className={`badge badge-tone-${ESTADO_TONO[oferta.estado] ?? 'gray'}`}>{ESTADO_LABEL[oferta.estado] ?? oferta.estado}</span>
              <span className={`badge badge-tone-${MODERACION_TONO[oferta.estadoModeracion] ?? 'gray'}`}>
                {MODERACION_LABEL[oferta.estadoModeracion] ?? oferta.estadoModeracion}
              </span>
              <span className={styles.metaDato}>
                <Icon name="users" size={15} /> {total} candidato{total !== 1 ? 's' : ''}
              </span>
              {oferta.fechaLimite && (
                <span className={styles.metaDato}>
                  <Icon name="clock" size={15} /> Cierra el {formatFecha(oferta.fechaLimite)}
                </span>
              )}
              {!puedeGestionar && (
                <span className={styles.metaDato}>
                  <Icon name="user" size={15} /> Responsable: <strong>{responsable ?? 'sin responsable asignado'}</strong>
                </span>
              )}
            </div>
          )}
        </div>
        {puedeGestionar && oferta && (
          <Link to={`/empresa/ofertas/${oferta.id}/editar`} className={`btn-secondary ${styles.editar}`}>
            <Icon name="edit" size={18} />
            Editar oferta
          </Link>
        )}
      </header>

      {moderacionEnCurso && (
        <p className={styles.aviso}>
          <Icon name="shield" size={16} />
          Esperando revisión institucional: la oferta todavía no es visible para los alumnos.
        </p>
      )}
      {moderacionRechazada && (
        <p className={`${styles.aviso} ${styles.avisoAlerta}`}>
          <Icon name="alert" size={16} />
          {puedeGestionar
            ? 'El instituto rechazó esta oferta y no es visible para los alumnos. Editala para volver a enviarla a revisión.'
            : 'El instituto rechazó esta oferta: no es visible para los alumnos.'}
        </p>
      )}
      {oferta && !puedeGestionar && (
        <p className={styles.aviso}>
          <Icon name="eye" size={16} />
          Vista de supervisión — la gestión de candidatos corresponde al reclutador responsable.
        </p>
      )}

      {error && <p className="error-msg" role="alert">{error.mensaje}</p>}

      {/* ── Filtro por estado (con contadores de ESTA oferta) ──────────────── */}
      {oferta && (
        <div className={styles.filtros}>
          <FilterGroup
            label="Estado" idPrefix="filtro-estado" options={opciones} gridMobile hideLabel
            ariaLabel="Filtrar candidatos por estado"
            value={filtro} onChange={setFiltro}
          />
        </div>
      )}

      {loading && postulaciones.length === 0 ? (
        <p className="msg" role="status">Cargando candidatos...</p>
      ) : !error && postulaciones.length === 0 ? (
        <EmptyState
          iconName="users"
          title={filtro ? 'No hay candidatos en ese estado.' : 'Esta oferta todavía no tiene postulaciones.'}
          hint={filtro ? undefined : 'Cuando un alumno se postule, lo vas a ver acá.'}
        >
          {filtro && <button type="button" className="btn-secondary" onClick={() => setFiltro('')}>Ver todos</button>}
        </EmptyState>
      ) : (
        <ul className={`${styles.lista} ${loading ? styles.recargando : ''}`} aria-busy={loading}>
          {postulaciones.map((p) => {
            const perfil = p.usuario?.perfil ?? {};
            const nombre = `${p.usuario?.nombre ?? ''} ${p.usuario?.apellido ?? ''}`.trim() || 'Candidato';
            const estado = normalizarEstado(p.estado);
            const chatHabilitado = puedeGestionar && ESTADOS_HABILITAN_CHAT.includes(estado) && p.usuario?.id;
            const transiciones = p.transicionesPermitidas ?? [];
            const cvArchivoId = perfil.cvArchivoId;

            const cambios = transiciones.map((hasta) => ({
              key: hasta,
              label: etiquetaTransicion(estado, hasta),
              danger: hasta === 'rechazado',
              onSelect: () => pedirCambio(p, hasta),
            }));

            const masAcciones = [
              ...(puedeGestionar ? [{
                key: 'nota', label: p.notasEmpresa ? 'Editar nota interna' : 'Agregar nota interna', onSelect: () => setNotaDe(p),
              }] : []),
              { key: 'historial', label: 'Ver historial', onSelect: () => setHistorialDe(p) },
              ...(cvArchivoId ? [{
                key: 'cv', label: 'Descargar CV',
                onSelect: () => abrirArchivoPrivado(cvArchivoId, { comoDescarga: true, nombreArchivo: `CV-${p.usuario?.nombre ?? 'candidato'}.pdf` }),
              }] : []),
            ];

            return (
              <li key={p.id} className={styles.candidato}>
                <div className={styles.candidatoCabecera}>
                  <Avatar
                    src={perfil.fotoPerfil ?? p.usuario?.fotoPerfil}
                    nombre={p.usuario?.nombre}
                    apellido={p.usuario?.apellido}
                    size={48}
                  />
                  <div className={styles.candidatoInfo}>
                    <span className={styles.candidatoNombre}>{nombre}</span>
                    {perfil.carrera && <span className={styles.candidatoDato}>{perfil.carrera}</span>}
                    <span className={styles.candidatoDato}>Se postuló el {formatFecha(p.fechaPostulacion ?? p.createdAt)}</span>
                  </div>
                  <div className={styles.candidatoEstado}>
                    <EstadoBadge estado={estado} />
                    {p.compatibilidadOferta != null && <Compatibilidad valor={p.compatibilidadOferta} />}
                  </div>
                </div>

                {p.notasEmpresa && (
                  <div className={styles.nota}>
                    <span className={styles.notaTitulo}>
                      <Icon name="lock" size={14} /> Nota interna
                    </span>
                    <p className={styles.notaTexto}>{p.notasEmpresa}</p>
                  </div>
                )}

                {p.cartaPresentacion && (
                  <details className={styles.carta}>
                    <summary>Carta de presentación</summary>
                    <p>{p.cartaPresentacion}</p>
                  </details>
                )}

                <div className={styles.acciones}>
                  {p.usuario?.id && (
                    <Link to={`/perfil/${p.usuario.id}`} className="btn-small" aria-label={`Ver perfil de ${nombre}`}>
                      Ver perfil
                    </Link>
                  )}
                  {chatHabilitado && (
                    <Link to={`/chat/${p.usuario.id}`} className="btn-small" aria-label={`Enviar mensaje a ${nombre}`}>
                      <Icon name="message" size={16} /> Mensaje
                    </Link>
                  )}
                  <span className={styles.accionesDerecha}>
                    {cambios.length > 0 && (
                      <ActionMenu
                        triggerLabel="Cambiar estado"
                        label={`Cambiar estado de ${nombre}`}
                        items={cambios}
                        disabled={procesando === p.id}
                      />
                    )}
                    <ActionMenu label={`Más acciones para ${nombre}`} items={masAcciones} disabled={procesando === p.id} />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && <Paginacion pagination={pagination} onPageChange={cargar} />}

      {confirmar && (
        <ConfirmModal
          title={CONFIRMAR[confirmar.estado].titulo}
          confirmLabel={CONFIRMAR[confirmar.estado].boton}
          tone={CONFIRMAR[confirmar.estado].tono}
          busy={procesando === confirmar.postulacion.id}
          onConfirm={() => cambiarEstado(confirmar.postulacion, confirmar.estado)}
          onClose={() => setConfirmar(null)}
          confirmId="btn-confirmar-estado"
        >
          <p>
            Candidato: <strong>{confirmar.postulacion.usuario?.nombre} {confirmar.postulacion.usuario?.apellido}</strong>
          </p>
          <p>{CONFIRMAR[confirmar.estado].texto}</p>
        </ConfirmModal>
      )}

      {notaDe && (
        <NotaInternaModal postulacion={notaDe} onClose={() => setNotaDe(null)} onGuardada={notaGuardada} />
      )}

      {historialDe && (
        <HistorialPostulacionModal postulacion={historialDe} onClose={() => setHistorialDe(null)} />
      )}
    </div>
  );
}
