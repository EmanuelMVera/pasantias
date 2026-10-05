/**
 * OfertaDetallePage.jsx — Detalle de una oferta para el alumno/egresado.
 *
 * Ruta: /ofertas/:id (roles alumno, egresado)
 * Consume: GET /api/ofertas/:id — con la sesión del alumno el backend agrega
 *   - `miPostulacion` ({ id, estado, fechaPostulacion } | null) y
 *   - `cvCargado` (sin CV el backend rechaza la postulación: CV_REQUERIDO),
 * y le sigue mostrando una oferta pausada/cerrada si ya se había postulado.
 *
 * El panel "Tu postulación" muestra UN solo estado, en este orden:
 *   1. ya postulado → estado actual + acceso a Mis postulaciones (y al chat
 *      cuando el estado lo habilita);
 *   2. la oferta no recibe postulaciones (pausada, cerrada o plazo vencido);
 *   3. falta el CV → llevarlo a subirlo;
 *   4. formulario: carta de presentación opcional + "Enviar postulación".
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ofertaService } from '../../services/oferta.service';
import { postulacionService } from '../../services/postulacion.service';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Icon from '../../components/ui/Icon';
import { ESTADOS_HABILITAN_CHAT, getEstadoInfo, normalizarEstado } from '../../constants/postulacionEstados';
import { TIPO_PUESTO, formatFecha, modalidadLabel, plazoVencido, puestoBadge } from '../../utils/ofertaPresentacion';
import styles from './OfertaDetallePage.module.css';

const CARTA_MAX = 2000;

function Seccion({ titulo, children }) {
  return (
    <Card as="section" title={titulo} headingLevel={2} className={styles.seccion}>
      {children}
    </Card>
  );
}

function PanelPostulacion({ oferta, onPostulado }) {
  const [carta, setCarta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const mia = oferta.miPostulacion;

  if (mia) {
    const estado = getEstadoInfo(mia.estado);
    const chat = ESTADOS_HABILITAN_CHAT.includes(normalizarEstado(mia.estado)) && oferta.creadaPorUsuarioId;
    return (
      <>
        <p className={styles.panelOk} role="status">
          <Icon name="checkCircle" size={20} />
          {mia.recien ? 'Te postulaste correctamente.' : 'Ya te postulaste a esta oferta.'}
        </p>
        <dl className={styles.panelDatos}>
          <div>
            <dt>Estado</dt>
            <dd><span className={`badge badge-tone-${estado.tone}`}>{estado.label}</span></dd>
          </div>
          {mia.fechaPostulacion && (
            <div>
              <dt>Fecha</dt>
              <dd>{formatFecha(mia.fechaPostulacion)}</dd>
            </div>
          )}
        </dl>
        <div className={styles.panelAcciones}>
          <Link to="/mis-postulaciones" className="btn-secondary">Ver mis postulaciones</Link>
          {chat && (
            <Link to={`/chat/${oferta.creadaPorUsuarioId}`} className="btn-primary">
              <Icon name="message" size={16} /> Chatear con el reclutador
            </Link>
          )}
        </div>
      </>
    );
  }

  if (oferta.estado !== 'activa' || plazoVencido(oferta)) {
    return (
      <p className={styles.panelAviso}>
        <Icon name="clock" size={20} />
        {oferta.estado === 'activa' ? 'El plazo para postularse venció.' : 'Esta oferta ya no recibe postulaciones.'}
      </p>
    );
  }

  if (oferta.cvCargado === false) {
    return (
      <>
        <p className={styles.panelAviso}>
          <Icon name="file" size={20} />
          Para postularte necesitás tener tu CV cargado en el perfil.
        </p>
        <div className={styles.panelAcciones}>
          <Link to="/perfil#cv" className="btn-primary">Subir mi CV</Link>
        </div>
      </>
    );
  }

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await postulacionService.postular({ ofertaId: oferta.id, cartaPresentacion: carta.trim() || undefined });
      onPostulado();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar la postulación. Probá de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className={styles.form}>
      <p className={styles.panelTexto}>
        La empresa va a ver tu perfil y el CV que tengas cargado al momento de postularte.
      </p>
      <div className="form-group">
        <label htmlFor="carta-presentacion">Carta de presentación <span className={styles.opcional}>(opcional)</span></label>
        <textarea
          id="carta-presentacion"
          value={carta}
          onChange={(e) => setCarta(e.target.value)}
          rows={6}
          maxLength={CARTA_MAX}
          placeholder="Contá en pocas líneas por qué te interesa esta oferta."
        />
        <span className={styles.contador}>{carta.length}/{CARTA_MAX}</span>
      </div>
      {error && <p className="error-msg" role="alert">{error}</p>}
      <button type="submit" className="btn-primary" disabled={enviando}>
        {enviando ? 'Enviando...' : 'Enviar postulación'}
      </button>
    </form>
  );
}

export default function OfertaDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  // Resultado atado al id que lo pidió: si cambia el id, es "cargando" sin
  // tener que resetear estado dentro del efecto.
  const [resultado, setResultado] = useState({ id: null, estado: 'cargando', oferta: null });
  const estadoCarga = resultado.id === id ? resultado.estado : 'cargando'; // cargando | ok | no_encontrada | error
  const oferta = resultado.oferta;
  const setOferta = (fn) => setResultado((r) => ({ ...r, oferta: fn(r.oferta) }));

  useEffect(() => {
    let vigente = true;
    ofertaService.getById(id)
      .then(({ data }) => { if (vigente) setResultado({ id, estado: 'ok', oferta: data.data }); })
      .catch((err) => {
        if (vigente) setResultado({ id, estado: err.response?.status === 404 ? 'no_encontrada' : 'error', oferta: null });
      });
    return () => { vigente = false; };
  }, [id]);

  const volver = <button type="button" onClick={() => navigate(-1)} className="btn-back">← Volver</button>;

  if (estadoCarga === 'cargando') {
    return <div className="page-container"><p className="msg" role="status">Cargando oferta...</p></div>;
  }

  if (estadoCarga !== 'ok') {
    return (
      <div className="page-container">
        {volver}
        <EmptyState
          iconName="briefcase"
          title={estadoCarga === 'no_encontrada' ? 'Esta oferta no está disponible.' : 'No se pudo cargar la oferta.'}
          hint={estadoCarga === 'no_encontrada' ? 'Puede haber sido cerrada o pausada por la empresa.' : 'Probá de nuevo en unos minutos.'}
        >
          <Link to="/ofertas" className="btn-primary">Ver ofertas disponibles</Link>
        </EmptyState>
      </div>
    );
  }

  const badge = puestoBadge(oferta);
  const tipo = oferta.tipoPuesto ? TIPO_PUESTO[oferta.tipoPuesto] : null;
  const marcarPostulado = () => setOferta((o) => ({
    ...o,
    miPostulacion: { estado: 'en_revision', fechaPostulacion: new Date().toISOString(), recien: true },
  }));

  return (
    <div className="page-container">
      {volver}

      {/* ── Cabecera ─────────────────────────────────────────────────────── */}
      <header className={styles.cabecera}>
        <div className={styles.cabeceraBadges}>
          {badge && <span className={`badge badge-tone-${badge.tone}`}>{badge.label}</span>}
          {oferta.tipoPuesto && (
            oferta.requiereExperiencia
              ? <span className="badge badge-tone-orange">Requiere experiencia</span>
              : <span className="badge badge-tone-green">Sin experiencia requerida</span>
          )}
          {oferta.estado !== 'activa' && (
            <span className="badge badge-tone-gray">{oferta.estado === 'cerrada' ? 'Oferta cerrada' : 'Oferta pausada'}</span>
          )}
        </div>
        <h1 className={styles.titulo}>{oferta.titulo}</h1>
        {oferta.empresa?.razonSocial && (
          <p className={styles.empresa}>
            <Icon name="building" size={18} />
            {oferta.empresaId
              ? <Link to={`/empresa/${oferta.empresaId}`}>{oferta.empresa.razonSocial}</Link>
              : oferta.empresa.razonSocial}
          </p>
        )}
        <ul className={styles.meta} aria-label="Datos de la oferta">
          {oferta.ciudad && <li><Icon name="mapPin" size={16} /> {oferta.ciudad}</li>}
          {oferta.modalidad && <li><Icon name="briefcase" size={16} /> {modalidadLabel(oferta.modalidad)}</li>}
          {oferta.remuneracion && <li><Icon name="handshake" size={16} /> {oferta.remuneracion}</li>}
          {oferta.fechaLimite && <li><Icon name="clock" size={16} /> Cierra el {formatFecha(oferta.fechaLimite)}</li>}
        </ul>
        {tipo && <p className={styles.tipoDesc}>{tipo.desc}</p>}
      </header>

      <div className={styles.grilla}>
        {/* ── Contenido ─────────────────────────────────────────────────── */}
        <div className={styles.contenido}>
          <Seccion titulo="Descripción">
            <p className={styles.texto}>{oferta.descripcion}</p>
          </Seccion>

          {oferta.requisitos && (
            <Seccion titulo="Requisitos">
              <p className={styles.texto}>{oferta.requisitos}</p>
            </Seccion>
          )}

          {oferta.requiereExperiencia && oferta.experienciaDetalle && (
            <Seccion titulo="Experiencia requerida">
              <p className={styles.texto}>{oferta.experienciaDetalle}</p>
            </Seccion>
          )}

          {oferta.habilidadesRequeridas?.length > 0 && (
            <Seccion titulo="Habilidades requeridas">
              <ul className={styles.tags}>
                {oferta.habilidadesRequeridas.map((h) => <li key={h} className={styles.tag}>{h}</li>)}
              </ul>
            </Seccion>
          )}

          {oferta.carrerasDestinatarias?.length > 0 && (
            <Seccion titulo="Carreras destinatarias">
              <ul className={styles.tags}>
                {oferta.carrerasDestinatarias.map((c) => <li key={c} className={`${styles.tag} ${styles.tagCarrera}`}>{c}</li>)}
              </ul>
            </Seccion>
          )}

          {oferta.beneficios && (
            <Seccion titulo="Beneficios">
              <p className={styles.texto}>{oferta.beneficios}</p>
            </Seccion>
          )}
        </div>

        {/* ── Tu postulación ────────────────────────────────────────────── */}
        <aside className={styles.lateral}>
          <Card as="section" titleId="sec-postulacion" title="Tu postulación" className={styles.panel}>
            <PanelPostulacion oferta={oferta} onPostulado={marcarPostulado} />
          </Card>
        </aside>
      </div>
    </div>
  );
}
