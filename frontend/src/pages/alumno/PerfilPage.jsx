/**
 * PerfilPage.jsx — Perfil profesional del alumno/egresado.
 *
 * Secciones:
 * 1. Datos básicos  → carrera, año egreso, descripción, área interés
 * 2. Redes sociales → linkedin, github, portfolio, redesSociales
 * 3. Experiencia    → experienciaLaboral, proyectos, certificaciones
 * 4. Preferencias   → disponibilidad, salarioPretendido, preferenciasLaborales,
 *                     visibilidadPerfil
 * 5. CV             → subida de archivo (existente, mantenido)
 *
 * Compatibilidad: mantiene todos los campos existentes (carrera, anioEgreso,
 * descripcion, areaInteres, linkedin, github, disponibilidad, cvPath).
 */

import { useState, useEffect } from 'react';
import { userService } from '../../services/user.service';
import FotoPerfilUpload from '../../components/FotoPerfilUpload/FotoPerfilUpload';
import TagsInput from '../../components/TagsInput/TagsInput';
import CvUpload from '../../components/CvUpload/CvUpload';
import CartaRecomendacionUpload from '../../components/CartaRecomendacionUpload/CartaRecomendacionUpload';
import styles from './PerfilPage.module.css';

// ── Helpers ────────────────────────────────────────────────────────────────────

// Convierte array de certificaciones a texto (una por línea) para el textarea
function certToText(val) {
  if (!val) return '';
  if (Array.isArray(val)) return val.join('\n');
  return String(val);
}

// Convierte texto del textarea a array para el backend
function textToCert(text) {
  if (!text || !text.trim()) return [];
  return text.split('\n').map(s => s.trim()).filter(Boolean);
}

// Convierte array a string separado por coma para inputs de tags
function arrayToTagText(val) {
  if (!val) return '';
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

// Convierte string separado por coma a array (para habilidades/idiomas)
function tagTextToArray(text) {
  if (!text || !text.trim()) return [];
  return text.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Calcula el % de completitud usando los MISMOS 15 campos que el backend
 * (_calcularCompletitudPerfil en student.controller.js), para que el número
 * del dashboard y el del perfil siempre coincidan.
 */
function calcularCompletitud(form, perfil) {
  const campos = [
    !!form.carrera,
    !!form.descripcion,
    // habilidades: array en la BD — si el perfil ya las tiene se cuenta
    perfil?.habilidades?.length > 0,
    // idiomas: igual
    perfil?.idiomas?.length > 0,
    !!form.linkedin,
    !!form.github,
    // cvPath: archivo subido, no editable en este form
    !!(perfil?.cvPath),
    !!form.areaInteres,
    !!form.disponibilidad,
    !!form.fotoPerfil,
    !!form.portfolio,
    !!form.experienciaLaboral,
    // certificaciones: puede venir como texto con saltos de línea
    !!(form.certificaciones && form.certificaciones.trim()),
    // telefono y ubicacion: ahora los devuelve el backend junto con el perfil
    !!(perfil?.telefono),
    !!(perfil?.ubicacion),
  ];
  const completados = campos.filter(Boolean).length;
  return Math.round((completados / campos.length) * 100);
}

// Sección del formulario con encabezado
function FormSection({ title, icon, children }) {
  return (
    <div className={styles.formSection}>
      <h2 className={styles.sectionTitle}>
        <span className={styles.sectionIcon}>{icon}</span> {title}
      </h2>
      {children}
    </div>
  );
}

export default function PerfilPage() {
  const [perfil, setPerfil]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg]           = useState('');

  const [form, setForm] = useState({
    // Campos existentes
    carrera:      '',
    anioEgreso:   '',
    descripcion:  '',
    areaInteres:  '',
    linkedin:     '',
    github:       '',
    disponibilidad: 'inmediata',
    // Nuevos campos
    portfolio:               '',
    experienciaLaboral:      '',
    proyectos:               '',
    certificaciones:         '',   // texto plano (una por línea), se convierte a array al guardar
    salarioPretendido:       '',
    preferenciasLaborales:   '',
    visibilidadPerfil:       'publica',
    redesSociales:           '',
    fotoPerfil:              '',
    // Campos del modelo Usuario (se guardan separados en el backend)
    telefono:                '',
    ubicacion:               '',
    // Habilidades e idiomas (arrays, se muestran como tags separados por coma)
    habilidadesTexto:        '',   // texto editable, se convierte a array al guardar
    idiomasTexto:            '',   // texto editable, se convierte a array al guardar
  });

  useEffect(() => {
    userService.getPerfil()
      .then(({ data }) => {
        const d = data.data || {};
        setPerfil(d);
        setForm((prev) => ({
          ...prev,
          ...d,
          // Convertir array de certificaciones a texto para el textarea
          certificaciones: certToText(d.certificaciones),
          // visibilidadPerfil: el backend devuelve boolean, el select usa string
          visibilidadPerfil: d.visibilidadPerfil === false ? 'privada' : 'publica',
          // redesSociales: el backend guarda { texto: "..." } en JSONB; extraer el texto
          redesSociales: d.redesSociales?.texto || (typeof d.redesSociales === 'string' ? d.redesSociales : '') || '',
          // Habilidades e idiomas: arrays → texto separado por coma
          habilidadesTexto: arrayToTagText(d.habilidades),
          idiomasTexto: arrayToTagText(d.idiomas),
          // telefono y ubicacion vienen del modelo Usuario (incluidos en el GET enriquecido)
          telefono: d.telefono || '',
          ubicacion: d.ubicacion || '',
        }));
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setMsg('');
    setGuardando(true);
    try {
      // Preparar datos: certificaciones como array para el backend
      // habilidadesTexto/idiomasTexto (texto) → arrays para el backend
      const payload = {
        ...form,
        certificaciones: textToCert(form.certificaciones),
        habilidades: tagTextToArray(form.habilidadesTexto),
        idiomas: tagTextToArray(form.idiomasTexto),
      };
      // Limpiar campos auxiliares de texto que no van al backend
      delete payload.habilidadesTexto;
      delete payload.idiomasTexto;
      // SEC-03: la foto se sube por su propio endpoint (handleSubirFoto), no por acá.
      delete payload.fotoPerfil;

      const { data } = await userService.updatePerfil(payload);
      const perfilActualizado = data.data;
      setPerfil(perfilActualizado);
      setMsg('✅ Perfil actualizado correctamente.');
    } catch (err) {
      const detalle = err?.response?.data?.message || '';
      setMsg(`❌ Error al guardar el perfil.${detalle ? ' ' + detalle : ''}`);
    } finally {
      setGuardando(false);
      setTimeout(() => setMsg(''), 4000);
    }
  };

  if (loading) return <p style={{ padding: '2rem' }}>Cargando perfil...</p>;

  const pct = calcularCompletitud(form, perfil);
  const pctColor = pct < 40 ? '#ef4444' : pct < 75 ? '#f59e0b' : '#10b981';

  return (
    <div className="page-container">
      <div className="dashboard-header">
        <h1>Mi Perfil Profesional</h1>
      </div>

      {/* Barra de completitud */}
      <div className={styles.completitudBar}>
        <div className={styles.completitudHeader}>
          <span>Perfil completado</span>
          <span style={{ color: pctColor, fontWeight: 700 }}>{pct}%</span>
        </div>
        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: `${pct}%`, background: pctColor }}
          />
        </div>
      </div>

      <form onSubmit={handleGuardar}>

        {/* ── 1. Datos básicos ────────────────────────────────────────────── */}
        <FormSection title="Datos Académicos" icon="🎓">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="pf-carrera">Carrera</label>
              <input id="pf-carrera" name="carrera" value={form.carrera || ''} onChange={handleChange}
                placeholder="Ej: Ingeniería en Sistemas" />
            </div>
            <div className="form-group">
              <label htmlFor="pf-anioEgreso">Año de Egreso</label>
              <input type="number" id="pf-anioEgreso" name="anioEgreso" value={form.anioEgreso || ''}
                onChange={handleChange} placeholder="2024" min="1990" max="2035" />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="pf-descripcion">Descripción / Resumen Profesional</label>
            <textarea id="pf-descripcion" name="descripcion" value={form.descripcion || ''} onChange={handleChange}
              rows={4} placeholder="Describí tu perfil, fortalezas y objetivos profesionales..." />
          </div>
          <div className="form-group">
            <label htmlFor="pf-areaInteres">Área de Interés</label>
            <input id="pf-areaInteres" name="areaInteres" value={form.areaInteres || ''} onChange={handleChange}
              placeholder="Ej: Desarrollo Web, Data Science, Redes..." />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="pf-telefono">Teléfono de contacto</label>
              <input id="pf-telefono" name="telefono" value={form.telefono || ''} onChange={handleChange}
                placeholder="Ej: +54 9 11 1234-5678" />
            </div>
            <div className="form-group">
              <label htmlFor="pf-ubicacion">Ubicación (ciudad / provincia)</label>
              <input id="pf-ubicacion" name="ubicacion" value={form.ubicacion || ''} onChange={handleChange}
                placeholder="Ej: Buenos Aires, Argentina" />
            </div>
          </div>
        </FormSection>

        {/* ── 2. Redes sociales y portfolio ───────────────────────────────── */}
        <FormSection title="Redes y Portfolio" icon="🌐">
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
              <label htmlFor="pf-portfolio">Portfolio / Sitio web</label>
              <input id="pf-portfolio" name="portfolio" value={form.portfolio || ''} onChange={handleChange}
                placeholder="https://mi-portfolio.com" />
            </div>
            <div className="form-group">
              <label htmlFor="pf-redesSociales">Otras redes sociales</label>
              <input id="pf-redesSociales" name="redesSociales" value={form.redesSociales || ''} onChange={handleChange}
                placeholder="Twitter, Behance, etc." />
            </div>
          </div>
          <FotoPerfilUpload
            fotoInicial={perfil?.fotoPerfil}
            onMensaje={setMsg}
            onFotoActualizada={(url) => setForm((prev) => ({ ...prev, fotoPerfil: url }))}
          />
        </FormSection>

        {/* ── 3. Experiencia y proyectos ──────────────────────────────────── */}
        <FormSection title="Experiencia y Proyectos" icon="💼">
          <div className="form-row">
            {/* Tags visuales de las habilidades ya cargadas */}
            <TagsInput
              name="habilidadesTexto"
              value={form.habilidadesTexto}
              onChange={handleChange}
              label="Habilidades Técnicas"
              hint="(separá con comas, ej: JavaScript, React, SQL)"
              placeholder="JavaScript, React, Node.js, SQL..."
              tags={tagTextToArray(form.habilidadesTexto)}
              tagBackground="var(--primary-light, #e0f2fe)"
              tagColor="var(--primary, #0284c7)"
            />
            <TagsInput
              name="idiomasTexto"
              value={form.idiomasTexto}
              onChange={handleChange}
              label="Idiomas"
              hint="(separá con comas, ej: Español, Inglés B2)"
              placeholder="Español nativo, Inglés B2, Portugués..."
              tags={tagTextToArray(form.idiomasTexto)}
              tagBackground="var(--success-light, #dcfce7)"
              tagColor="var(--success, #16a34a)"
            />
          </div>
          <div className="form-group">
            <label htmlFor="pf-experienciaLaboral">Experiencia Laboral</label>
            <textarea id="pf-experienciaLaboral" name="experienciaLaboral" value={form.experienciaLaboral || ''}
              onChange={handleChange} rows={4}
              placeholder="Describí tus trabajos previos, roles y responsabilidades..." />
          </div>
          <div className="form-group">
            <label htmlFor="pf-proyectos">Proyectos Destacados</label>
            <textarea id="pf-proyectos" name="proyectos" value={form.proyectos || ''}
              onChange={handleChange} rows={3}
              placeholder="Proyectos propios, académicos o freelance relevantes..." />
          </div>
          <div className="form-group">
            <label htmlFor="pf-certificaciones">Certificaciones y Cursos</label>
            <textarea id="pf-certificaciones" name="certificaciones" value={form.certificaciones || ''}
              onChange={handleChange} rows={3}
              placeholder="Ej: AWS Cloud Practitioner, Scrum Master, etc." />
          </div>
        </FormSection>

        {/* ── 4. Preferencias laborales ───────────────────────────────────── */}
        <FormSection title="Preferencias Laborales" icon="🎯">
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
              <label htmlFor="pf-salarioPretendido">Salario Pretendido (mensual)</label>
              <input id="pf-salarioPretendido" name="salarioPretendido" value={form.salarioPretendido || ''}
                onChange={handleChange} placeholder="Ej: $300.000 - $400.000 ARS" />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="pf-preferenciasLaborales">Preferencias Laborales</label>
            <textarea id="pf-preferenciasLaborales" name="preferenciasLaborales" value={form.preferenciasLaborales || ''}
              onChange={handleChange} rows={2}
              placeholder="Modalidad preferida, tipo de empresa, sector, etc." />
          </div>
          <div className="form-group">
            <label htmlFor="pf-visibilidadPerfil">Visibilidad del Perfil</label>
            <select id="pf-visibilidadPerfil" name="visibilidadPerfil" value={form.visibilidadPerfil || 'publica'}
              onChange={handleChange}>
              <option value="publica">Público — visible para todas las empresas</option>
              <option value="privada">Privado — solo yo puedo verlo</option>
              <option value="solo_empresas_verificadas">Solo empresas verificadas</option>
            </select>
          </div>
        </FormSection>

        {/* Mensajes de feedback */}
        {msg && <p className={msg.startsWith('✅') ? styles.msgOk : 'error-msg'}>{msg}</p>}

        <button type="submit" className="btn-primary" disabled={guardando}
          style={{ width: '100%', maxWidth: '300px', marginTop: '0.5rem' }}>
          {guardando ? 'Guardando...' : '💾 Guardar cambios'}
        </button>
      </form>

      {/* ── 5. Currículum Vitae ────────────────────────────────────────── */}
      <CvUpload cvArchivoId={perfil?.cvArchivoId} onMensaje={setMsg} />

      {/* ── 6. Carta de Recomendación ─────────────────────────────────── */}
      <CartaRecomendacionUpload
        cartaArchivoId={perfil?.cartaArchivoId}
        onMensaje={setMsg}
        onPerfilActualizado={setPerfil}
      />
    </div>
  );
}

