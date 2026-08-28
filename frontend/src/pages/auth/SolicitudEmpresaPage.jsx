/**
 * SolicitudEmpresaPage.jsx — Formulario público de solicitud de registro de empresa.
 *
 * Permite a una empresa interesada enviar su pre-registro sin crear cuenta.
 * La solicitud queda en estado "pendiente" hasta que el administrador la evalúa.
 *
 * Secciones:
 *   A. Datos de la empresa
 *   B. Datos del responsable / administrador de empresa
 *   C. Carreras de interés
 *   D. Información adicional
 *   E. Reclutadores iniciales (opcional)
 *
 * Ruta: /registro-empresa
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { solicitudEmpresaService } from '../../services/api';
import styles from './SolicitudEmpresaPage.module.css';

// ── Lista de carreras disponibles ─────────────────────────────────────────────
const CARRERAS = [
  'Análisis de Sistemas',
  'Diseño Industrial',
  'Enfermería',
  'Radiología',
  'Higiene y Seguridad',
  'Tecnicatura en Programación',
  'Administración de Empresas',
  'Contabilidad',
  'Marketing y Publicidad',
  'Diseño Gráfico',
  'Laboratorio',
  'Fisioterapia',
];

const INITIAL_FORM = {
  // A — Empresa
  razonSocial: '',
  cuit:        '',
  rubro:       '',
  sitioWeb:    '',
  direccion:   '',
  ciudad:      '',
  telefono:    '',
  email:       '',       // email institucional/de contacto de la empresa
  // B — Responsable
  responsableNombre:   '',
  responsableApellido: '',
  responsableEmail:    '',
  responsableTelefono: '',
  responsableCargo:    '',
  // D — Adicional
  descripcion: '',
  puestos:     '',
};

export default function SolicitudEmpresaPage() {
  const [form, setForm]           = useState(INITIAL_FORM);
  const [carreras, setCarreras]   = useState([]);
  const [reclutadores, setReclutadores] = useState([{ nombre: '', apellido: '', email: '' }]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState(false);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  function handleCarreraToggle(carrera) {
    setCarreras(prev =>
      prev.includes(carrera)
        ? prev.filter(c => c !== carrera)
        : [...prev, carrera]
    );
  }

  function handleReclutadorChange(idx, field, value) {
    setReclutadores(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  function agregarReclutador() {
    setReclutadores(prev => [...prev, { nombre: '', apellido: '', email: '' }]);
  }

  function quitarReclutador(idx) {
    setReclutadores(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Validación frontend mínima
    const faltantes = [];
    if (!form.razonSocial.trim())        faltantes.push('Razón Social');
    if (!form.cuit.trim())               faltantes.push('CUIT');
    if (!form.rubro.trim())              faltantes.push('Rubro');
    if (!form.email.trim())              faltantes.push('Email de contacto institucional');
    if (!form.responsableNombre.trim())  faltantes.push('Nombre del responsable');
    if (!form.responsableApellido.trim()) faltantes.push('Apellido del responsable');
    if (!form.responsableEmail.trim())   faltantes.push('Email del responsable');

    if (faltantes.length > 0) {
      setError(`Por favor completá los campos obligatorios: ${faltantes.join(', ')}.`);
      return;
    }

    // Validar reclutadores: si alguno tiene dato, los 3 campos son requeridos
    for (let i = 0; i < reclutadores.length; i++) {
      const r = reclutadores[i];
      const tieneAlgo = r.nombre.trim() || r.apellido.trim() || r.email.trim();
      if (tieneAlgo && (!r.nombre.trim() || !r.apellido.trim() || !r.email.trim())) {
        setError(`El reclutador #${i + 1} requiere nombre, apellido y email completos.`);
        return;
      }
    }

    setLoading(true);
    try {
      // Filtrar reclutadores completamente vacíos antes de enviar
      const recls = reclutadores.filter(r =>
        r.nombre.trim() && r.apellido.trim() && r.email.trim()
      );

      await solicitudEmpresaService.crear({
        ...form,
        carrerasInteres: carreras,
        reclutadores:    recls,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al enviar la solicitud. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  // ── Modal de éxito ────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className={styles.pageWrapper}>
        <div className={styles.successCard}>
          <div className={styles.successIcon}>🎉</div>
          <h2 className={styles.successTitle}>¡Solicitud enviada!</h2>
          <p className={styles.successMsg}>
            Tu solicitud fue enviada correctamente.<br />
            <strong>Será evaluada por el instituto</strong> y nos contactaremos al
            email del responsable con la resolución.
          </p>
          <Link to="/" className={styles.successBtn}>
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  // ── Formulario principal ──────────────────────────────────────────────────────
  return (
    <div className={styles.pageWrapper}>
      <div className={styles.formCard}>

        {/* Encabezado */}
        <div className={styles.header}>
          <span className={styles.headerBadge}>🏢 Empresas</span>
          <h1 className={styles.title}>Registrarse como empresa</h1>
          <p className={styles.subtitle}>
            Completá el formulario y el equipo del instituto revisará tu solicitud
            para habilitarte como empresa colaboradora.
          </p>
        </div>

        {/* Aviso informativo */}
        <div className={styles.infoBanner}>
          <span className={styles.infoIcon}>ℹ️</span>
          <span>
            Tu cuenta no se creará automáticamente. El instituto evaluará la solicitud
            y se comunicará con vos por email.
          </span>
        </div>

        <form onSubmit={handleSubmit} className={styles.form} noValidate>

          {/* ── A. Datos de la empresa ── */}
          <fieldset className={styles.section}>
            <legend className={styles.sectionTitle}>A. Datos de la empresa</legend>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="razonSocial" className={styles.label}>
                  Razón Social <span className={styles.required}>*</span>
                </label>
                <input
                  id="razonSocial" name="razonSocial" type="text"
                  value={form.razonSocial} onChange={handleChange}
                  placeholder="Ej: Tech Solutions S.A."
                  className={styles.input} required
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="cuit" className={styles.label}>
                  CUIT <span className={styles.required}>*</span>
                </label>
                <input
                  id="cuit" name="cuit" type="text"
                  value={form.cuit} onChange={handleChange}
                  placeholder="Ej: 30-12345678-9"
                  className={styles.input} required
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="rubro" className={styles.label}>
                  Rubro <span className={styles.required}>*</span>
                </label>
                <input
                  id="rubro" name="rubro" type="text"
                  value={form.rubro} onChange={handleChange}
                  placeholder="Ej: Tecnología e Informática"
                  className={styles.input} required
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="sitioWeb" className={styles.label}>Sitio web</label>
                <input
                  id="sitioWeb" name="sitioWeb" type="url"
                  value={form.sitioWeb} onChange={handleChange}
                  placeholder="https://www.empresa.com"
                  className={styles.input}
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="ciudad" className={styles.label}>Ciudad</label>
                <input
                  id="ciudad" name="ciudad" type="text"
                  value={form.ciudad} onChange={handleChange}
                  placeholder="Ej: Avellaneda"
                  className={styles.input}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="telefono" className={styles.label}>Teléfono institucional</label>
                <input
                  id="telefono" name="telefono" type="tel"
                  value={form.telefono} onChange={handleChange}
                  placeholder="Ej: 11-4300-1234"
                  className={styles.input}
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="direccion" className={styles.label}>Dirección</label>
                <input
                  id="direccion" name="direccion" type="text"
                  value={form.direccion} onChange={handleChange}
                  placeholder="Ej: Av. Mitre 1234, piso 3"
                  className={styles.input}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="email" className={styles.label}>
                  Email de contacto institucional <span className={styles.required}>*</span>
                </label>
                <input
                  id="email" name="email" type="email"
                  value={form.email} onChange={handleChange}
                  placeholder="contacto@empresa.com"
                  className={styles.input} required
                />
                <span className={styles.fieldHint}>
                  Email visible en el perfil de la empresa (no es el de acceso al sistema).
                </span>
              </div>
            </div>
          </fieldset>

          {/* ── B. Datos del responsable ── */}
          <fieldset className={styles.section}>
            <legend className={styles.sectionTitle}>B. Datos del responsable</legend>

            <div className={styles.infoBanner} style={{ marginBottom: '1rem' }}>
              <span className={styles.infoIcon}>👤</span>
              <span>
                El responsable será el <strong>usuario administrador</strong> de la empresa en el sistema.
                Las credenciales de acceso se enviarán a su email personal.
              </span>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="responsableNombre" className={styles.label}>
                  Nombre <span className={styles.required}>*</span>
                </label>
                <input
                  id="responsableNombre" name="responsableNombre" type="text"
                  value={form.responsableNombre} onChange={handleChange}
                  placeholder="Ej: María"
                  className={styles.input} required
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="responsableApellido" className={styles.label}>
                  Apellido <span className={styles.required}>*</span>
                </label>
                <input
                  id="responsableApellido" name="responsableApellido" type="text"
                  value={form.responsableApellido} onChange={handleChange}
                  placeholder="Ej: González"
                  className={styles.input} required
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="responsableEmail" className={styles.label}>
                  Email del responsable <span className={styles.required}>*</span>
                </label>
                <input
                  id="responsableEmail" name="responsableEmail" type="email"
                  value={form.responsableEmail} onChange={handleChange}
                  placeholder="responsable@empresa.com"
                  className={styles.input} required
                />
                <span className={styles.fieldHint}>
                  Con este email se creará la cuenta de acceso al sistema.
                </span>
              </div>
              <div className={styles.field}>
                <label htmlFor="responsableCargo" className={styles.label}>Cargo</label>
                <input
                  id="responsableCargo" name="responsableCargo" type="text"
                  value={form.responsableCargo} onChange={handleChange}
                  placeholder="Ej: Gerente de RR.HH."
                  className={styles.input}
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="responsableTelefono" className={styles.label}>
                  Teléfono del responsable
                </label>
                <input
                  id="responsableTelefono" name="responsableTelefono" type="tel"
                  value={form.responsableTelefono} onChange={handleChange}
                  placeholder="Ej: +54 11 5555-1234"
                  className={styles.input}
                />
              </div>
            </div>
          </fieldset>

          {/* ── C. Carreras de interés ── */}
          <fieldset className={styles.section}>
            <legend className={styles.sectionTitle}>C. Carreras de interés</legend>
            <p className={styles.sectionHint}>
              Seleccioná las carreras cuyos estudiantes o egresados te interesan contratar:
            </p>
            <div className={styles.checkGrid}>
              {CARRERAS.map(carrera => {
                const checked = carreras.includes(carrera);
                return (
                  <label
                    key={carrera}
                    className={`${styles.checkItem} ${checked ? styles.checkItemActive : ''}`}
                    htmlFor={`carrera-${carrera}`}
                  >
                    <input
                      id={`carrera-${carrera}`}
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleCarreraToggle(carrera)}
                      className={styles.checkboxHidden}
                    />
                    <span className={styles.checkIcon}>{checked ? '✔' : ''}</span>
                    <span className={styles.checkLabel}>{carrera}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* ── D. Información adicional ── */}
          <fieldset className={styles.section}>
            <legend className={styles.sectionTitle}>D. Información adicional</legend>

            <div className={styles.field}>
              <label htmlFor="descripcion" className={styles.label}>Descripción de la empresa</label>
              <textarea
                id="descripcion" name="descripcion"
                value={form.descripcion} onChange={handleChange}
                placeholder="Contanos a qué se dedica tu empresa, su historia y cultura..."
                className={styles.textarea} rows={4}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="puestos" className={styles.label}>Puestos o áreas de interés</label>
              <textarea
                id="puestos" name="puestos"
                value={form.puestos} onChange={handleChange}
                placeholder="Ej: Desarrollo de software, diseño UX/UI, soporte técnico..."
                className={styles.textarea} rows={3}
              />
            </div>
          </fieldset>

          {/* ── E. Reclutadores iniciales ── */}
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>E. Reclutadores iniciales (opcional)</legend>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)', marginBottom: '1rem', lineHeight: 1.5 }}>
              Podés indicar los reclutadores que querés dar de alta. El administrador creará sus cuentas
              al aprobar la solicitud y les enviará las credenciales por email.
              Si se agrega un reclutador, los tres campos (nombre, apellido y email) son obligatorios.
            </p>

            {reclutadores.map((r, idx) => (
              <div key={idx} className={styles.reclutadorRow}>
                <input
                  type="text"
                  placeholder="Nombre *"
                  value={r.nombre}
                  onChange={e => handleReclutadorChange(idx, 'nombre', e.target.value)}
                  className={styles.input}
                />
                <input
                  type="text"
                  placeholder="Apellido *"
                  value={r.apellido}
                  onChange={e => handleReclutadorChange(idx, 'apellido', e.target.value)}
                  className={styles.input}
                />
                <input
                  type="email"
                  placeholder="Email *"
                  value={r.email}
                  onChange={e => handleReclutadorChange(idx, 'email', e.target.value)}
                  className={styles.input}
                />
                {reclutadores.length > 1 && (
                  <button
                    type="button"
                    className={styles.btnQuitarReclutador}
                    onClick={() => quitarReclutador(idx)}
                    title="Quitar"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              className={styles.btnAgregarReclutador}
              onClick={agregarReclutador}
            >
              + Agregar otro reclutador
            </button>
          </fieldset>

          {/* ── Error ── */}
          {error && (
            <div className={styles.errorBanner} role="alert">
              <span>⚠️</span> {error}
            </div>
          )}

          {/* ── Acciones ── */}
          <div className={styles.actions}>
            <Link to="/" className={styles.btnSecondary}>
              ← Cancelar
            </Link>
            <button
              type="submit"
              id="btn-enviar-solicitud"
              className={styles.btnPrimary}
              disabled={loading}
            >
              {loading ? 'Enviando...' : '📤 Enviar Solicitud'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
