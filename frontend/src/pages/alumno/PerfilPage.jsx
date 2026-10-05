/**
 * PerfilPage.jsx — Perfil profesional del alumno/egresado.
 *
 * Ruta: /perfil (roles alumno, egresado). Ancla #cv → sección del CV (la usan
 * el Inicio y el detalle de oferta cuando falta el CV).
 *
 * Datos INSTITUCIONALES (solo lectura; los administra el instituto por
 * importación CSV o el admin): nombre, apellido, email, legajo, condición,
 * carrera, año de egreso. El backend rechaza cambiarlos desde acá.
 *
 * Secciones editables:
 * 1. Presentación y contacto → descripción, área de interés, teléfono, ubicación
 * 2. Redes y portfolio → linkedin, github, portfolio, otras redes, foto
 * 3. Experiencia → habilidades, idiomas, experiencia laboral, proyectos,
 *    certificaciones
 * 4. Preferencias → disponibilidad, salario pretendido, preferencias,
 *    visibilidad del perfil
 * 5. CV y 6. Carta de recomendación → subidas propias (no pasan por "Guardar")
 *
 * El % y la lista de "Te falta" usan los MISMOS 14 campos que el backend
 * (perfil.service.js::CAMPOS_COMPLETITUD): solo lo que el alumno puede
 * completar. Si falta un dato institucional se muestra un aviso aparte.
 * El CV cuenta solo si hay un Archivo real (cvArchivoId), no un cvPath suelto.
 *
 * Visibilidad (booleano en el backend): público, o privado → solo lo ven el
 * propio alumno, el admin y las empresas a cuyas ofertas se postuló.
 */

import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { userService } from '../../services/user.service';
import PageHeader from '../../components/ui/PageHeader';
import Toast from '../../components/ui/Toast';
import Icon from '../../components/ui/Icon';
import FotoPerfilUpload from '../../components/FotoPerfilUpload/FotoPerfilUpload';
import TagsInput from '../../components/TagsInput/TagsInput';
import CvUpload from '../../components/CvUpload/CvUpload';
import CartaRecomendacionUpload from '../../components/CartaRecomendacionUpload/CartaRecomendacionUpload';
import TelefonoArgentinaInput from '../../components/ui/TelefonoArgentinaInput';
import { enfocarPrimerError, errorTelefonoAR, esUrlValida, primerError } from '../../utils/validacion';
import { normalizarTelefonoAR } from '../../utils/formatos';
import styles from './PerfilPage.module.css';

// ── Helpers ────────────────────────────────────────────────────────────────────

// Certificaciones: array en la BD ↔ texto (una por línea) en el textarea
function certToText(val) {
  if (!val) return '';
  if (Array.isArray(val)) return val.join('\n');
  return String(val);
}

function textToCert(text) {
  if (!text || !text.trim()) return [];
  return text.split('\n').map((s) => s.trim()).filter(Boolean);
}

// Habilidades/idiomas: array en la BD ↔ texto separado por comas
function arrayToTagText(val) {
  if (!val) return '';
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

function tagTextToArray(text) {
  if (!text || !text.trim()) return [];
  return text.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Campos editables que se envían al guardar (los institucionales nunca). */
const CAMPOS_EDITABLES = [
  'descripcion', 'areaInteres', 'linkedin', 'github', 'portfolio', 'redesSociales',
  'disponibilidad', 'experienciaLaboral', 'proyectos', 'salarioPretendido',
  'preferenciasLaborales', 'visibilidadPerfil', 'telefono', 'ubicacion',
];

const CONDICION = { alumno: 'Alumno', egresado: 'Egresado' };

/** Los 14 campos de completitud del backend, con su nombre para "Te falta". */
function camposCompletitud(form, perfil) {
  return [
    { label: 'Descripción', ok: !!form.descripcion },
    { label: 'Habilidades', ok: tagTextToArray(form.habilidadesTexto).length > 0 },
    { label: 'Idiomas', ok: tagTextToArray(form.idiomasTexto).length > 0 },
    { label: 'LinkedIn', ok: !!form.linkedin },
    { label: 'GitHub', ok: !!form.github },
    { label: 'CV', ok: !!perfil?.cvArchivoId },
    { label: 'Área de interés', ok: !!form.areaInteres },
    { label: 'Disponibilidad', ok: !!form.disponibilidad },
    { label: 'Foto', ok: !!form.fotoPerfil },
    { label: 'Portfolio', ok: !!form.portfolio },
    { label: 'Experiencia laboral', ok: !!form.experienciaLaboral },
    { label: 'Certificaciones', ok: textToCert(form.certificaciones).length > 0 },
    { label: 'Teléfono', ok: !!form.telefono },
    { label: 'Ubicación', ok: !!form.ubicacion },
  ];
}

function tonoProgreso(pct) {
  if (pct < 40) return styles.barraBaja;
  if (pct < 75) return styles.barraMedia;
  return styles.barraAlta;
}

function FormSection({ title, icon, children }) {
  return (
    <section className={styles.formSection}>
      <h2 className={styles.sectionTitle}>
        <span className={styles.sectionIcon}><Icon name={icon} size={18} /></span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function PerfilPage() {
  const { usuario } = useAuth();
  const { hash } = useLocation();
  const { toast, showToast } = useToast(4000);
  const [perfil, setPerfil]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errorTelefono, setErrorTelefono] = useState('');

  const [form, setForm] = useState({
    descripcion:           '',
    areaInteres:           '',
    linkedin:              '',
    github:                '',
    disponibilidad:        'inmediata',
    portfolio:             '',
    experienciaLaboral:    '',
    proyectos:             '',
    certificaciones:       '',   // texto (una por línea) → array al guardar
    salarioPretendido:     '',
    preferenciasLaborales: '',
    visibilidadPerfil:     'publica',
    redesSociales:         '',
    fotoPerfil:            '',
    // Campos del modelo Usuario (el backend los guarda aparte)
    telefono:              '',
    ubicacion:             '',
    // Texto editable → arrays al guardar
    habilidadesTexto:      '',
    idiomasTexto:          '',
  });

  useEffect(() => {
    userService.getPerfil()
      .then(({ data }) => {
        const d = data.data || {};
        setPerfil(d);
        setForm((prev) => ({
          ...prev,
          ...Object.fromEntries(CAMPOS_EDITABLES.map((c) => [c, d[c] ?? prev[c]])),
          fotoPerfil: d.fotoPerfil || '',
          certificaciones: certToText(d.certificaciones),
          // visibilidadPerfil: boolean en el backend, el select usa string
          visibilidadPerfil: d.visibilidadPerfil === false ? 'privada' : 'publica',
          // redesSociales: JSONB { texto } en el backend
          redesSociales: d.redesSociales?.texto || (typeof d.redesSociales === 'string' ? d.redesSociales : '') || '',
          habilidadesTexto: arrayToTagText(d.habilidades),
          idiomasTexto: arrayToTagText(d.idiomas),
          telefono: d.telefono || '',
          ubicacion: d.ubicacion || '',
        }));
      })
      .catch(() => showToast('No se pudo cargar tu perfil.', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  // Ancla #cv: cuando el perfil ya está dibujado, llevar a la sección del CV.
  useEffect(() => {
    if (loading || hash !== '#cv') return;
    document.getElementById('cv')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, hash]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const mensaje = (texto, tono = 'default') => { if (texto) showToast(texto, tono); };

  const handleGuardar = async (e) => {
    e.preventDefault();
    // Mismas reglas que backend/src/validators/user.validator.js (que valida igual).
    const errorFormato = primerError([
      [form.linkedin, esUrlValida, 'LinkedIn debe ser una dirección completa (ej. https://linkedin.com/in/tu-perfil).'],
      [form.github, esUrlValida, 'GitHub debe ser una dirección completa (ej. https://github.com/tu-usuario).'],
      [form.portfolio, esUrlValida, 'El portfolio debe ser una dirección completa (ej. https://mi-portfolio.com).'],
    ]);
    if (errorFormato) {
      showToast(errorFormato, 'error');
      return;
    }
    // El error del teléfono va junto al campo.
    const errorTel = errorTelefonoAR(form.telefono);
    if (errorTel) {
      setErrorTelefono(errorTel);
      enfocarPrimerError(['pf-telefono'], { 'pf-telefono': errorTel });
      return;
    }
    setGuardando(true);
    try {
      // Solo campos editables: los institucionales (carrera, año de egreso,
      // legajo, nombre, email…) el backend los rechaza con 400. La foto, el CV
      // y la carta van por sus propios endpoints de subida.
      const payload = {
        ...Object.fromEntries(CAMPOS_EDITABLES.map((c) => [c, form[c]])),
        telefono: normalizarTelefonoAR(form.telefono) ?? form.telefono, // canónico +54…
        certificaciones: textToCert(form.certificaciones),
        habilidades: tagTextToArray(form.habilidadesTexto),
        idiomas: tagTextToArray(form.idiomasTexto),
      };

      const { data } = await userService.updatePerfil(payload);
      setPerfil(data.data);
      showToast('Perfil actualizado.', 'success');
    } catch (err) {
      showToast(err?.response?.data?.message || 'No se pudo guardar el perfil.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  if (loading) return <div className="page-container"><p className="msg" role="status">Cargando perfil...</p></div>;

  const campos = camposCompletitud(form, perfil);
  const pct = Math.round((campos.filter((c) => c.ok).length / campos.length) * 100);
  const faltan = campos.filter((c) => !c.ok);
  const faltanInstitucionales = perfil?.datosInstitucionalesFaltantes ?? [];
  const datosInstitucionales = [
    ['Nombre', [perfil?.nombre, perfil?.apellido].filter(Boolean).join(' ')],
    ['Email', perfil?.email],
    ['Legajo', perfil?.legajo],
    ['Condición', CONDICION[perfil?.rol] ?? perfil?.rol],
    ['Carrera', perfil?.carrera],
    // El año de egreso solo tiene sentido para egresados.
    ...(perfil?.rol === 'egresado' || perfil?.anioEgreso ? [['Año de egreso', perfil?.anioEgreso]] : []),
  ];

  return (
    <div className="page-container">
      <PageHeader
        title="Mi perfil"
        subtitle="Es lo que ven las empresas cuando revisan tu postulación."
        actions={usuario?.id && (
          <Link to={`/perfil/${usuario.id}`} className="btn-secondary">
            <Icon name="eye" size={16} /> Ver cómo me ven
          </Link>
        )}
      />

      {/* ── Completitud ─────────────────────────────────────────────────── */}
      <section className={styles.completitud} aria-labelledby="completitud-titulo">
        <div className={styles.completitudHeader}>
          <h2 id="completitud-titulo" className={styles.completitudTitulo}>Perfil completado</h2>
          <strong>{pct}%</strong>
        </div>
        <div
          className={styles.barra}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-labelledby="completitud-titulo"
        >
          <div className={`${styles.barraRelleno} ${tonoProgreso(pct)}`} style={{ width: `${pct}%` }} />
        </div>
        {faltan.length > 0 ? (
          <p className={styles.faltan}>
            <span>Te falta:</span> {faltan.map((c) => c.label).join(' · ')}
          </p>
        ) : (
          <p className={styles.completo}>Tu perfil está completo.</p>
        )}
      </section>

      {/* ── Datos institucionales (solo lectura) ─────────────────────────── */}
      <section className={styles.formSection} aria-labelledby="sec-institucional">
        <h2 id="sec-institucional" className={styles.sectionTitle}>
          <span className={styles.sectionIcon}><Icon name="graduation" size={18} /></span>
          Datos institucionales
        </h2>
        <p className={styles.ayuda}>Los registra el instituto. Si algo no es correcto, contactá a la institución.</p>
        <dl className={styles.institucional}>
          {datosInstitucionales.map(([etiqueta, valor]) => (
            <div key={etiqueta}>
              <dt>{etiqueta}</dt>
              <dd>{valor || <span className={styles.sinDato}>Sin registrar</span>}</dd>
            </div>
          ))}
        </dl>
        {faltanInstitucionales.length > 0 && (
          <p className={styles.avisoInstitucional} role="note">
            <Icon name="info" size={16} />
            Falta información académica registrada por el instituto ({faltanInstitucionales.join(', ')}).
            Contactá a la institución para actualizarla.
          </p>
        )}
      </section>

      <form onSubmit={handleGuardar}>

        {/* ── 1. Presentación y contacto ─────────────────────────────────── */}
        <FormSection title="Presentación y contacto" icon="user">
          <div className="form-group">
            <label htmlFor="pf-descripcion">Descripción / resumen profesional</label>
            <textarea id="pf-descripcion" name="descripcion" value={form.descripcion || ''} onChange={handleChange}
              rows={4} placeholder="Contá tu perfil, tus fortalezas y qué buscás." />
          </div>
          <div className="form-group">
            <label htmlFor="pf-areaInteres">Área de interés</label>
            <input id="pf-areaInteres" name="areaInteres" value={form.areaInteres || ''} onChange={handleChange}
              placeholder="Ej: Desarrollo web, Datos, Redes..." />
          </div>
          <div className="form-row">
            <div className="form-group">
              <TelefonoArgentinaInput
                id="pf-telefono" label="Teléfono de contacto"
                value={form.telefono || ''}
                onChange={(telefono) => { setForm((prev) => ({ ...prev, telefono })); setErrorTelefono(''); }}
                error={errorTelefono}
              />
            </div>
            <div className="form-group">
              <label htmlFor="pf-ubicacion">Ubicación (ciudad / provincia)</label>
              <input id="pf-ubicacion" name="ubicacion" value={form.ubicacion || ''} onChange={handleChange}
                placeholder="Ej: Buenos Aires, Argentina" />
            </div>
          </div>
        </FormSection>

        {/* ── 2. Redes y portfolio ───────────────────────────────────────── */}
        <FormSection title="Redes y portfolio" icon="globe">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="pf-linkedin">LinkedIn</label>
              <input id="pf-linkedin" name="linkedin" value={form.linkedin || ''} onChange={handleChange}
                placeholder="https://linkedin.com/in/tu-perfil" />
            </div>
            <div className="form-group">
              <label htmlFor="pf-github">GitHub</label>
              <input id="pf-github" name="github" value={form.github || ''} onChange={handleChange}
                placeholder="https://github.com/tu-usuario" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="pf-portfolio">Portfolio / sitio web</label>
              <input id="pf-portfolio" name="portfolio" value={form.portfolio || ''} onChange={handleChange}
                placeholder="https://mi-portfolio.com" />
            </div>
            <div className="form-group">
              <label htmlFor="pf-redesSociales">Otras redes</label>
              <input id="pf-redesSociales" name="redesSociales" value={form.redesSociales || ''} onChange={handleChange}
                placeholder="Behance, Dribbble, etc." />
            </div>
          </div>
          <FotoPerfilUpload
            fotoInicial={perfil?.fotoPerfil}
            onMensaje={mensaje}
            onFotoActualizada={(url) => setForm((prev) => ({ ...prev, fotoPerfil: url }))}
          />
        </FormSection>

        {/* ── 3. Experiencia y proyectos ─────────────────────────────────── */}
        <FormSection title="Experiencia y proyectos" icon="briefcase">
          <div className="form-row">
            <TagsInput
              name="habilidadesTexto"
              value={form.habilidadesTexto}
              onChange={handleChange}
              label="Habilidades técnicas"
              hint="(separadas por comas)"
              placeholder="JavaScript, React, SQL..."
              tags={tagTextToArray(form.habilidadesTexto)}
              tagBackground="var(--primary-light)"
              tagColor="var(--primary-dark)"
            />
            <TagsInput
              name="idiomasTexto"
              value={form.idiomasTexto}
              onChange={handleChange}
              label="Idiomas"
              hint="(separados por comas)"
              placeholder="Español nativo, Inglés B2..."
              tags={tagTextToArray(form.idiomasTexto)}
              tagBackground="var(--success-soft)"
              tagColor="var(--success-text)"
            />
          </div>
          <div className="form-group">
            <label htmlFor="pf-experienciaLaboral">Experiencia laboral</label>
            <textarea id="pf-experienciaLaboral" name="experienciaLaboral" value={form.experienciaLaboral || ''}
              onChange={handleChange} rows={4}
              placeholder="Trabajos previos, roles y responsabilidades." />
          </div>
          <div className="form-group">
            <label htmlFor="pf-proyectos">Proyectos destacados</label>
            <textarea id="pf-proyectos" name="proyectos" value={form.proyectos || ''}
              onChange={handleChange} rows={3}
              placeholder="Proyectos propios, académicos o freelance." />
          </div>
          <div className="form-group">
            <label htmlFor="pf-certificaciones">Certificaciones y cursos <span className={styles.hint}>(una por línea)</span></label>
            <textarea id="pf-certificaciones" name="certificaciones" value={form.certificaciones || ''}
              onChange={handleChange} rows={3}
              placeholder="Ej: AWS Cloud Practitioner" />
          </div>
        </FormSection>

        {/* ── 4. Preferencias ────────────────────────────────────────────── */}
        <FormSection title="Preferencias laborales" icon="settings">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="pf-disponibilidad">Disponibilidad</label>
              <select id="pf-disponibilidad" name="disponibilidad" value={form.disponibilidad || 'inmediata'}
                onChange={handleChange}>
                <option value="inmediata">Inmediata</option>
                <option value="1_mes">En 1 mes</option>
                <option value="3_meses">En 3 meses</option>
                <option value="no_disponible">No disponible</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="pf-salarioPretendido">Salario pretendido (mensual)</label>
              <input id="pf-salarioPretendido" name="salarioPretendido" value={form.salarioPretendido || ''}
                onChange={handleChange} placeholder="Ej: $300.000 - $400.000" />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="pf-preferenciasLaborales">Preferencias</label>
            <textarea id="pf-preferenciasLaborales" name="preferenciasLaborales" value={form.preferenciasLaborales || ''}
              onChange={handleChange} rows={2}
              placeholder="Modalidad, tipo de empresa, sector, etc." />
          </div>
          <div className="form-group">
            <label htmlFor="pf-visibilidadPerfil">Visibilidad del perfil</label>
            <select id="pf-visibilidadPerfil" name="visibilidadPerfil" value={form.visibilidadPerfil || 'publica'}
              onChange={handleChange} aria-describedby="pf-visibilidad-ayuda">
              <option value="publica">Público</option>
              <option value="privada">Privado</option>
            </select>
            <span id="pf-visibilidad-ayuda" className={styles.ayuda}>
              {form.visibilidadPerfil === 'privada'
                ? 'Solo lo ven las empresas a cuyas ofertas te postulás.'
                : 'Lo pueden ver las empresas y estudiantes de la plataforma.'}
              {' '}El salario pretendido y tus preferencias nunca se muestran.
            </span>
          </div>
        </FormSection>

        <div className={styles.guardar}>
          <button type="submit" className="btn-primary" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
          <span className={styles.hint}>El CV y la carta se guardan al subirlos.</span>
        </div>
      </form>

      {/* ── 5. Currículum Vitae ─────────────────────────────────────────── */}
      <CvUpload
        cvArchivoId={perfil?.cvArchivoId}
        onMensaje={mensaje}
        onCvActualizado={(cv) => setPerfil((p) => ({ ...p, ...cv }))}
      />

      {/* ── 6. Carta de recomendación ───────────────────────────────────── */}
      <CartaRecomendacionUpload
        cartaArchivoId={perfil?.cartaArchivoId}
        onMensaje={mensaje}
        onPerfilActualizado={(p) => setPerfil((prev) => ({ ...prev, ...p }))}
      />

      <Toast toast={toast} />
    </div>
  );
}
