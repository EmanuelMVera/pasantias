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
import { solicitudEmpresaService } from '../../services/solicitudEmpresa.service';
import Brand from '../../components/Brand/Brand';
import { useCarreras } from '../../hooks/useCarreras';
import CuitInput from '../../components/ui/CuitInput';
import TelefonoArgentinaInput from '../../components/ui/TelefonoArgentinaInput';
import { completarUrl, normalizarTelefonoAR } from '../../utils/formatos';
import {
  enfocarPrimerError, errorCuit, errorTelefonoAR, esEmailValido, esUrlValida,
} from '../../utils/validacion';
import styles from './SolicitudEmpresaPage.module.css';

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

// Orden visual de los campos: al enviar con errores se enfoca el primero.
const ORDEN_CAMPOS = [
  'razonSocial', 'cuit', 'rubro', 'sitioWeb', 'telefono', 'email',
  'responsableNombre', 'responsableApellido', 'responsableEmail', 'responsableTelefono',
];

const OBLIGATORIOS = {
  razonSocial: 'Completá la razón social.',
  cuit: 'Completá el CUIT.',
  rubro: 'Completá el rubro.',
  email: 'Completá el email de contacto institucional.',
  responsableNombre: 'Completá el nombre del responsable.',
  responsableApellido: 'Completá el apellido del responsable.',
  responsableEmail: 'Completá el email del responsable.',
};

/** Errores por campo { id: mensaje } (mismas reglas que el backend, que valida igual). */
function validarFormulario(form, reclutadores) {
  const e = {};
  for (const [campo, msg] of Object.entries(OBLIGATORIOS)) {
    if (!String(form[campo] ?? '').trim()) e[campo] = msg;
  }
  if (!e.cuit && errorCuit(form.cuit)) e.cuit = errorCuit(form.cuit);
  if (!e.email && !esEmailValido(form.email)) e.email = 'El email no tiene un formato válido.';
  if (!e.responsableEmail && !esEmailValido(form.responsableEmail)) e.responsableEmail = 'El email no tiene un formato válido.';
  if (form.sitioWeb.trim() && !esUrlValida(completarUrl(form.sitioWeb))) {
    e.sitioWeb = 'Ingresá una dirección completa (ej. https://www.empresa.com).';
  }
  if (errorTelefonoAR(form.telefono)) e.telefono = errorTelefonoAR(form.telefono);
  if (errorTelefonoAR(form.responsableTelefono)) e.responsableTelefono = errorTelefonoAR(form.responsableTelefono);
  reclutadores.forEach((rec, i) => {
    const tieneAlgo = rec.nombre.trim() || rec.apellido.trim() || rec.email.trim();
    if (!tieneAlgo) return;
    if (!rec.nombre.trim() || !rec.apellido.trim() || !rec.email.trim()) {
      e[`rec-email-${i}`] = `El reclutador #${i + 1} requiere nombre, apellido y email completos.`;
    } else if (!esEmailValido(rec.email)) {
      e[`rec-email-${i}`] = `El email del reclutador #${i + 1} no tiene un formato válido.`;
    }
  });
  return e;
}

/** Mensaje de error debajo de un campo (aria-describedby apunta a `<id>-error`). */
function ErrorCampo({ id, mensaje }) {
  if (!mensaje) return null;
  return <p id={`${id}-error`} className={styles.fieldError} role="alert">{mensaje}</p>;
}

export default function SolicitudEmpresaPage() {
  const [form, setForm]           = useState(INITIAL_FORM);
  const [carreras, setCarreras]   = useState([]);
  // Catálogo institucional único (GET /api/catalogos/carreras).
  const { carreras: catalogoCarreras, error: errorCatalogo } = useCarreras();
  const [reclutadores, setReclutadores] = useState([{ nombre: '', apellido: '', email: '' }]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [errores, setErrores]     = useState({});
  const [success, setSuccess]     = useState(false);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function setCampo(name, value) {
    setForm(prev => ({ ...prev, [name]: value }));
    setErrores(prev => (prev[name] ? { ...prev, [name]: '' } : prev));
  }

  function handleChange(e) {
    setCampo(e.target.name, e.target.value);
  }

  /** aria-invalid + aria-describedby para un campo con error. */
  const aria = (id) => (errores[id]
    ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` }
    : {});

  function handleCarreraToggle(carrera) {
    setCarreras(prev =>
      prev.includes(carrera)
        ? prev.filter(c => c !== carrera)
        : [...prev, carrera]
    );
  }

  function handleReclutadorChange(idx, field, value) {
    setReclutadores(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    setErrores(prev => (prev[`rec-email-${idx}`] ? { ...prev, [`rec-email-${idx}`]: '' } : prev));
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

    // Errores junto a cada campo + foco en el primero (el formulario es largo:
    // nadie tiene que bajar hasta el final para saber qué falta).
    const nuevos = validarFormulario(form, reclutadores);
    setErrores(nuevos);
    const orden = [...ORDEN_CAMPOS, ...reclutadores.map((_, i) => `rec-email-${i}`)];
    if (enfocarPrimerError(orden, nuevos)) {
      setError('Revisá los campos marcados.');
      return;
    }

    setLoading(true);
    try {
      // Filtrar reclutadores completamente vacíos antes de enviar
      const recls = reclutadores.filter(r =>
        r.nombre.trim() && r.apellido.trim() && r.email.trim()
      );

      // Se envía el formato canónico (el backend igual lo vuelve a normalizar):
      // CUIT de 11 dígitos, teléfonos +54…, URL absoluta.
      await solicitudEmpresaService.crear({
        ...form,
        sitioWeb: completarUrl(form.sitioWeb),
        telefono: normalizarTelefonoAR(form.telefono) ?? form.telefono,
        responsableTelefono: normalizarTelefonoAR(form.responsableTelefono) ?? form.responsableTelefono,
        carrerasInteres: carreras,
        reclutadores:    recls,
      });
      setSuccess(true);
    } catch (err) {
      const mensaje = err.response?.data?.message || 'Error al enviar la solicitud. Intentá de nuevo.';
      // CUIT ya registrado / con solicitud pendiente: el error va junto al campo.
      if (/CUIT/.test(mensaje)) {
        setErrores((prev) => ({ ...prev, cuit: mensaje }));
        enfocarPrimerError(['cuit'], { cuit: mensaje });
      }
      setError(mensaje);
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
            <strong>Será evaluada por el instituto</strong>. Vas a recibir un email de
            confirmación y vamos a escribirte al email del responsable con la resolución.
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
          <div className={styles.brandRow}>
            <Brand to="/" variant="full" tone="dark" />
          </div>
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

        <form onSubmit={handleSubmit} noValidate>

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
                  className={styles.input} {...aria('razonSocial')} required
                />
                <ErrorCampo id="razonSocial" mensaje={errores.razonSocial} />
              </div>
              <div className={styles.field}>
                <label htmlFor="cuit" className={styles.label}>
                  CUIT <span className={styles.required}>*</span>
                </label>
                <CuitInput
                  id="cuit" name="cuit"
                  value={form.cuit} onChange={(cuit) => setCampo('cuit', cuit)}
                  error={errores.cuit}
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
                  className={styles.input} {...aria('rubro')} required
                />
                <ErrorCampo id="rubro" mensaje={errores.rubro} />
              </div>
              <div className={styles.field}>
                <label htmlFor="sitioWeb" className={styles.label}>Sitio web</label>
                <input
                  id="sitioWeb" name="sitioWeb" type="url"
                  onBlur={() => setCampo('sitioWeb', completarUrl(form.sitioWeb))}
                  value={form.sitioWeb} onChange={handleChange}
                  placeholder="https://www.empresa.com"
                  className={styles.input} {...aria('sitioWeb')}
                />
                <ErrorCampo id="sitioWeb" mensaje={errores.sitioWeb} />
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
                <TelefonoArgentinaInput
                  id="telefono" label="Teléfono institucional"
                  value={form.telefono} onChange={(v) => setCampo('telefono', v)}
                  error={errores.telefono}
                  labelClassName={styles.label} inputClassName={styles.input}
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
                  className={styles.input} {...aria('email')} required
                />
                <ErrorCampo id="email" mensaje={errores.email} />
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
                  className={styles.input} {...aria('responsableNombre')} required
                />
                <ErrorCampo id="responsableNombre" mensaje={errores.responsableNombre} />
              </div>
              <div className={styles.field}>
                <label htmlFor="responsableApellido" className={styles.label}>
                  Apellido <span className={styles.required}>*</span>
                </label>
                <input
                  id="responsableApellido" name="responsableApellido" type="text"
                  value={form.responsableApellido} onChange={handleChange}
                  placeholder="Ej: González"
                  className={styles.input} {...aria('responsableApellido')} required
                />
                <ErrorCampo id="responsableApellido" mensaje={errores.responsableApellido} />
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
                  className={styles.input} {...aria('responsableEmail')} required
                />
                <ErrorCampo id="responsableEmail" mensaje={errores.responsableEmail} />
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
                <TelefonoArgentinaInput
                  id="responsableTelefono" label="Teléfono del responsable"
                  value={form.responsableTelefono} onChange={(v) => setCampo('responsableTelefono', v)}
                  error={errores.responsableTelefono}
                  labelClassName={styles.label} inputClassName={styles.input}
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
            {errorCatalogo && <p className={styles.sectionHint} role="alert">{errorCatalogo}</p>}
            <div className={styles.checkGrid}>
              {catalogoCarreras.map(carrera => {
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
              <div key={idx}>
              <div className={styles.reclutadorRow}>
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
                  id={`rec-email-${idx}`}
                  type="email"
                  placeholder="Email *"
                  aria-label={`Email del reclutador #${idx + 1}`}
                  value={r.email}
                  onChange={e => handleReclutadorChange(idx, 'email', e.target.value)}
                  className={styles.input}
                  {...aria(`rec-email-${idx}`)}
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
              <ErrorCampo id={`rec-email-${idx}`} mensaje={errores[`rec-email-${idx}`]} />
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
