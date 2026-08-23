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
import { userService, getArchivoUrl } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
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
  const { actualizarUsuario } = useAuth();

  const [perfil, setPerfil]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg]           = useState('');
  const [cvFile, setCvFile]     = useState(null);
  const [subiendoCV, setSubiendoCV] = useState(false);
  const [cartaFile, setCartaFile] = useState(null);
  const [subiendoCarta, setSubiendoCarta] = useState(false);
  const [fotoPreview, setFotoPreview] = useState('');

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
        // Inicializar preview de foto
        if (d.fotoPerfil) setFotoPreview(d.fotoPerfil);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Actualizar preview de foto en tiempo real
    if (name === 'fotoPerfil') setFotoPreview(value);
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

      const { data } = await userService.updatePerfil(payload);
      const perfilActualizado = data.data;
      setPerfil(perfilActualizado);
      // Sincroniza fotoPerfil con el AuthContext si cambió
      if (form.fotoPerfil) actualizarUsuario({ fotoPerfil: form.fotoPerfil });
      // Mantener preview actualizado
      setFotoPreview(form.fotoPerfil || '');
      setMsg('✅ Perfil actualizado correctamente.');
    } catch (err) {
      const detalle = err?.response?.data?.message || '';
      setMsg(`❌ Error al guardar el perfil.${detalle ? ' ' + detalle : ''}`);
    } finally {
      setGuardando(false);
      setTimeout(() => setMsg(''), 4000);
    }
  };

  const handleSubirCV = async () => {
    if (!cvFile) return;
    setSubiendoCV(true);
    const formData = new FormData();
    formData.append('cv', cvFile);
    try {
      await userService.subirCV(formData);
      setMsg('✅ CV subido correctamente.');
    } catch {
      setMsg('❌ Error al subir el CV.');
    } finally {
      setSubiendoCV(false);
      setTimeout(() => setMsg(''), 4000);
    }
  };

  const handleSubirCarta = async () => {
    if (!cartaFile) return;
    setSubiendoCarta(true);
    const formData = new FormData();
    formData.append('carta', cartaFile);
    try {
      await userService.subirCartaRecomendacion(formData);
      setMsg('✅ Carta de recomendación subida correctamente.');
      // Recargar perfil para mostrar el nuevo link
      const { data } = await userService.getPerfil();
      setPerfil(data.data || {});
    } catch {
      setMsg('❌ Error al subir la carta de recomendación.');
    } finally {
      setSubiendoCarta(false);
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
              <label>Carrera</label>
              <input name="carrera" value={form.carrera || ''} onChange={handleChange}
                placeholder="Ej: Ingeniería en Sistemas" />
            </div>
            <div className="form-group">
              <label>Año de Egreso</label>
              <input type="number" name="anioEgreso" value={form.anioEgreso || ''}
                onChange={handleChange} placeholder="2024" min="1990" max="2035" />
            </div>
          </div>
          <div className="form-group">
            <label>Descripción / Resumen Profesional</label>
            <textarea name="descripcion" value={form.descripcion || ''} onChange={handleChange}
              rows={4} placeholder="Describí tu perfil, fortalezas y objetivos profesionales..." />
          </div>
          <div className="form-group">
            <label>Área de Interés</label>
            <input name="areaInteres" value={form.areaInteres || ''} onChange={handleChange}
              placeholder="Ej: Desarrollo Web, Data Science, Redes..." />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Teléfono de contacto</label>
              <input name="telefono" value={form.telefono || ''} onChange={handleChange}
                placeholder="Ej: +54 9 11 1234-5678" />
            </div>
            <div className="form-group">
              <label>Ubicación (ciudad / provincia)</label>
              <input name="ubicacion" value={form.ubicacion || ''} onChange={handleChange}
                placeholder="Ej: Buenos Aires, Argentina" />
            </div>
          </div>
        </FormSection>

        {/* ── 2. Redes sociales y portfolio ───────────────────────────────── */}
        <FormSection title="Redes y Portfolio" icon="🌐">
          <div className="form-row">
            <div className="form-group">
              <label>LinkedIn</label>
              <input name="linkedin" value={form.linkedin || ''} onChange={handleChange}
                placeholder="https://linkedin.com/in/tu-perfil" />
            </div>
            <div className="form-group">
              <label>GitHub</label>
              <input name="github" value={form.github || ''} onChange={handleChange}
                placeholder="https://github.com/tu-usuario" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Portfolio / Sitio web</label>
              <input name="portfolio" value={form.portfolio || ''} onChange={handleChange}
                placeholder="https://mi-portfolio.com" />
            </div>
            <div className="form-group">
              <label>Otras redes sociales</label>
              <input name="redesSociales" value={form.redesSociales || ''} onChange={handleChange}
                placeholder="Twitter, Behance, etc." />
            </div>
          </div>
          <div className="form-group">
            <label>URL de foto de perfil</label>
            <input name="fotoPerfil" value={form.fotoPerfil || ''} onChange={handleChange}
              placeholder="https://ejemplo.com/mi-foto.jpg" />
            {fotoPreview && (
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <img
                  key={fotoPreview}
                  src={fotoPreview}
                  alt="Preview foto de perfil"
                  onError={(e) => { e.currentTarget.style.opacity = '0'; e.currentTarget.style.pointerEvents = 'none'; }}
                  onLoad={(e) => { e.currentTarget.style.opacity = '1'; }}
                  style={{
                    width: 72, height: 72, borderRadius: '50%',
                    objectFit: 'cover', border: '2px solid var(--border)',
                    opacity: 0,
                    transition: 'opacity 0.3s ease',
                  }}
                />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Vista previa</span>
              </div>
            )}
          </div>
        </FormSection>

        {/* ── 3. Experiencia y proyectos ──────────────────────────────────── */}
        <FormSection title="Experiencia y Proyectos" icon="💼">
          <div className="form-row">
            <div className="form-group">
              <label>
                Habilidades Técnicas
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>
                  (separá con comas, ej: JavaScript, React, SQL)
                </span>
              </label>
              <input
                name="habilidadesTexto"
                value={form.habilidadesTexto || ''}
                onChange={handleChange}
                placeholder="JavaScript, React, Node.js, SQL..."
              />
              {/* Tags visuales de las habilidades ya cargadas */}
              {form.habilidadesTexto && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
                  {tagTextToArray(form.habilidadesTexto).map((h, i) => (
                    <span key={i} style={{
                      background: 'var(--primary-light, #e0f2fe)', color: 'var(--primary, #0284c7)',
                      borderRadius: '999px', padding: '0.15rem 0.65rem', fontSize: '0.78rem', fontWeight: 600,
                    }}>{h}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="form-group">
              <label>
                Idiomas
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>
                  (separá con comas, ej: Español, Inglés B2)
                </span>
              </label>
              <input
                name="idiomasTexto"
                value={form.idiomasTexto || ''}
                onChange={handleChange}
                placeholder="Español nativo, Inglés B2, Portugués..."
              />
              {form.idiomasTexto && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
                  {tagTextToArray(form.idiomasTexto).map((idioma, i) => (
                    <span key={i} style={{
                      background: 'var(--success-light, #dcfce7)', color: 'var(--success, #16a34a)',
                      borderRadius: '999px', padding: '0.15rem 0.65rem', fontSize: '0.78rem', fontWeight: 600,
                    }}>{idioma}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="form-group">
            <label>Experiencia Laboral</label>
            <textarea name="experienciaLaboral" value={form.experienciaLaboral || ''}
              onChange={handleChange} rows={4}
              placeholder="Describí tus trabajos previos, roles y responsabilidades..." />
          </div>
          <div className="form-group">
            <label>Proyectos Destacados</label>
            <textarea name="proyectos" value={form.proyectos || ''}
              onChange={handleChange} rows={3}
              placeholder="Proyectos propios, académicos o freelance relevantes..." />
          </div>
          <div className="form-group">
            <label>Certificaciones y Cursos</label>
            <textarea name="certificaciones" value={form.certificaciones || ''}
              onChange={handleChange} rows={3}
              placeholder="Ej: AWS Cloud Practitioner, Scrum Master, etc." />
          </div>
        </FormSection>

        {/* ── 4. Preferencias laborales ───────────────────────────────────── */}
        <FormSection title="Preferencias Laborales" icon="🎯">
          <div className="form-row">
            <div className="form-group">
              <label>Disponibilidad</label>
              <select name="disponibilidad" value={form.disponibilidad || 'inmediata'}
                onChange={handleChange}>
                <option value="inmediata">Inmediata</option>
                <option value="1_mes">En 1 mes</option>
                <option value="3_meses">En 3 meses</option>
                <option value="no_disponible">No disponible</option>
              </select>
            </div>
            <div className="form-group">
              <label>Salario Pretendido (mensual)</label>
              <input name="salarioPretendido" value={form.salarioPretendido || ''}
                onChange={handleChange} placeholder="Ej: $300.000 - $400.000 ARS" />
            </div>
          </div>
          <div className="form-group">
            <label>Preferencias Laborales</label>
            <textarea name="preferenciasLaborales" value={form.preferenciasLaborales || ''}
              onChange={handleChange} rows={2}
              placeholder="Modalidad preferida, tipo de empresa, sector, etc." />
          </div>
          <div className="form-group">
            <label>Visibilidad del Perfil</label>
            <select name="visibilidadPerfil" value={form.visibilidadPerfil || 'publica'}
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
      <div className="cv-section">
        <h2>Currículum Vitae</h2>
        {perfil?.cvPath && (
          <p>
            CV actual:{' '}
            <a href={getArchivoUrl(perfil.cvPath)} target="_blank" rel="noreferrer">
              📄 Ver CV actual
            </a>
          </p>
        )}
        <div className={styles.cvUpload}>
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => setCvFile(e.target.files[0])}
          />
          <button
            className="btn-secondary"
            onClick={handleSubirCV}
            disabled={!cvFile || subiendoCV}
          >
            {subiendoCV ? 'Subiendo...' : '⬆️ Subir nuevo CV'}
          </button>
        </div>
        <p className={styles.cvHint}>Solo archivos PDF. Máximo 5 MB.</p>
      </div>

      {/* ── 6. Carta de Recomendación ─────────────────────────────────── */}
      <div className="cv-section">
        <h2>🎓 Carta de Recomendación</h2>
        <p style={{ fontSize: '0.87rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Podés subir una carta de recomendación de un docente, empleador o entidad académica.
          Es visible para las empresas cuando revisan tu perfil como candidato.
        </p>
        {perfil?.cartaRecomendacion && (
          <p>
            Carta actual:{' '}
            <a href={getArchivoUrl(perfil.cartaRecomendacion)} target="_blank" rel="noreferrer">
              📄 Ver carta actual
            </a>
          </p>
        )}
        <div className={styles.cvUpload}>
          <input
            id="carta-file"
            type="file"
            accept=".pdf,image/*"
            onChange={(e) => setCartaFile(e.target.files[0])}
          />
          <button
            className="btn-secondary"
            onClick={handleSubirCarta}
            disabled={!cartaFile || subiendoCarta}
          >
            {subiendoCarta ? 'Subiendo...' : '⬆️ Subir carta'}
          </button>
        </div>
        <p className={styles.cvHint}>PDF o imagen (JPG, PNG). Máximo 5 MB.</p>
      </div>
    </div>
  );
}

