/**
 * MiEmpresaPage.jsx — Perfil de la empresa ("Mi empresa").
 *
 * admin_empresa: ve y edita los campos permitidos y cambia el logo.
 * reclutador:    solo lectura (campos deshabilitados, sin Guardar ni logo).
 *
 * Campos editables: descripcion, rubro, sitioWeb, telefono, direccion, ciudad.
 * Protegidos (solo lectura): razonSocial, cuit, estado y nivel de confianza.
 * El nivel de confianza se muestra UNA sola vez, en Datos institucionales, con
 * una explicación de qué implica (no es un plan ni una jerarquía de cuenta).
 * El logo se sube aparte (POST /empresas/mi-empresa/logo): el backend valida
 * tipo real, extensión y tamaño; acá solo se anticipa el error al usuario.
 *
 * "Ver perfil público" abre la misma página que ven alumnos y egresados
 * (/empresa/:id, EmpresaPublicaPage) — no hay una segunda vista duplicada.
 *
 * Ruta: /empresa/mi-empresa
 */

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { empresaService } from '../../services/empresa.service';
import { useEmpresa } from '../../hooks/useEmpresa';
import { useToast } from '../../hooks/useToast';
import Avatar from '../../components/Avatar/Avatar';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Icon from '../../components/ui/Icon';
import Toast from '../../components/ui/Toast';
import styles from './MiEmpresaPage.module.css';

const ESTADO = {
  aprobada:  { label: 'Aprobada', tone: 'green' },
  pendiente: { label: 'Pendiente de aprobación', tone: 'orange' },
  rechazada: { label: 'Rechazada', tone: 'red' },
};

const LOGO_TIPOS = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

// ── Normalización de URL ──────────────────────────────────────────────────────
// Agrega "https://" si el valor tiene aspecto de URL pero sin protocolo.
// Devuelve cadena vacía si está vacío. Devuelve null si no parece una URL válida.
function normalizeUrl(raw) {
  if (!raw || !raw.trim()) return '';
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try { new URL(trimmed); return trimmed; } catch { return null; }
  }
  if (/^[\w-]+(\.[\w-]+)+/i.test(trimmed)) {
    const withProtocol = 'https://' + trimmed;
    try { new URL(withProtocol); return withProtocol; } catch { return null; }
  }
  return null;
}

export default function MiEmpresaPage() {
  const { esAdminEmpresa, loading: loadingRol, refrescar } = useEmpresa();
  const { toast, showToast } = useToast(3500);

  const [empresa,    setEmpresa]    = useState(null);
  const [responsable, setResponsable] = useState(null); // usuario admin_empresa
  const [form,       setForm]       = useState({});
  const [loading,    setLoading]    = useState(true);
  const [guardando,  setGuardando]  = useState(false);
  const [error,      setError]      = useState('');
  const [logoFile,     setLogoFile]     = useState(null);
  const [logoPreview,  setLogoPreview]  = useState(null);
  const [logoError,    setLogoError]    = useState('');
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const inputLogoRef = useRef(null);

  // admin_empresa: puede editar. reclutador: solo lectura.
  const esAdmin = esAdminEmpresa;

  useEffect(() => {
    empresaService.getMiEmpresa()
      .then((empRes) => {
        const e = empRes.data?.data ?? empRes.data;
        setEmpresa(e);
        setForm({
          descripcion: e.descripcion ?? '',
          rubro:       e.rubro       ?? '',
          sitioWeb:    e.sitioWeb    ?? '',
          telefono:    e.telefono    ?? '',
          direccion:   e.direccion   ?? '',
          ciudad:      e.ciudad      ?? '',
        });
      })
      .catch(() => setError('No se pudo cargar el perfil de empresa.'))
      .finally(() => setLoading(false));

    // Persona responsable de la cuenta (dato secundario de la identidad).
    empresaService.getEquipo()
      .then((res) => {
        const admin = (res.data?.data ?? []).find((m) => m.rolInterno === 'admin_empresa');
        setResponsable(admin?.usuario ?? null);
      })
      .catch(() => {});
  }, []);

  // Liberar la URL temporal de la vista previa.
  useEffect(() => () => { if (logoPreview) URL.revokeObjectURL(logoPreview); }, [logoPreview]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const urlNorm = normalizeUrl(form.sitioWeb);
    if (form.sitioWeb.trim() && urlNorm === null) {
      setError('El sitio web no parece una URL válida. Ej: www.empresa.com o https://empresa.com');
      return;
    }

    setGuardando(true);
    try {
      const { data } = await empresaService.updateMiEmpresa({ ...form, sitioWeb: urlNorm || '' });
      const updated = data.data ?? data;
      setEmpresa(updated);
      setForm((prev) => ({ ...prev, sitioWeb: updated.sitioWeb ?? '' }));
      showToast('Datos de empresa actualizados correctamente.', 'success');
      refrescar();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al guardar los cambios.');
    } finally {
      setGuardando(false);
    }
  };

  // ── Logo (SEC-03: el backend valida tipo real y tamaño) ───────────────────
  const descartarLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setLogoError('');
    if (inputLogoRef.current) inputLogoRef.current.value = '';
  };

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0] || null;
    setLogoError('');
    if (!file) { descartarLogo(); return; }
    if (!LOGO_TIPOS.includes(file.type)) {
      descartarLogo();
      setLogoError('Solo se aceptan imágenes PNG, JPG o WEBP.');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      descartarLogo();
      setLogoError('La imagen del logo no puede superar los 2 MB.');
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleSubirLogo = async () => {
    if (!logoFile) return;
    setSubiendoLogo(true);
    setLogoError('');
    try {
      const fd = new FormData();
      fd.append('logo', logoFile);
      const { data } = await empresaService.subirLogo(fd);
      setEmpresa((prev) => ({ ...prev, logo: data.logo }));
      descartarLogo();
      showToast('Logo actualizado.', 'success');
      refrescar(); // sidebar, topbar y menú de usuario muestran el logo nuevo
    } catch (err) {
      setLogoError(err.response?.data?.message ?? 'No se pudo subir el logo.');
    } finally {
      setSubiendoLogo(false);
    }
  };

  if (loading || loadingRol) return <p className="msg">Cargando perfil de empresa...</p>;

  const estado = ESTADO[empresa?.estadoAprobacion] ?? { label: empresa?.estadoAprobacion ?? '—', tone: 'gray' };
  const confiable = empresa?.nivelConfianza === 'confiable';
  const nombreResponsable = responsable ? `${responsable.nombre} ${responsable.apellido}` : null;


  return (
    <div className={`page-container ${styles.pagina}`}>
      <Toast toast={toast} />

      <PageHeader
        title="Mi empresa"
        subtitle={esAdmin
          ? 'Datos institucionales y perfil público de tu empresa.'
          : 'Perfil de la empresa (solo lectura).'}
      />

      {!esAdmin && (
        <p className={styles.lecturaInfo}>
          <Icon name="lock" size={16} />
          Solo el administrador de empresa puede modificar estos datos. Estás viendo el perfil en modo lectura.
        </p>
      )}

      {error && <p className={`error-msg ${styles.error}`} role="alert">{error}</p>}

      {/* ── Resumen: identidad de la empresa ───────────────────────────────── */}
      <Card as="section" className={styles.bloque} aria-label="Resumen de la empresa">
        <div className={styles.resumen}>
          <div className={styles.logoCol}>
            <Avatar
              key={logoPreview || empresa?.logo || 'sin-logo'}
              src={logoPreview || empresa?.logo || null}
              nombre={empresa?.razonSocial}
              apellido=""
              size={96}
              className={styles.logo}
            />
            {logoPreview && <span className={styles.previewTag}>Vista previa</span>}
          </div>

          <div className={styles.resumenInfo}>
            <span className={styles.razonSocial}>{empresa?.razonSocial ?? '—'}</span>
            {empresa?.rubro && <span className={styles.rubro}>{empresa.rubro}</span>}
            <div className={styles.badges}>
              <span className={`badge badge-tone-${estado.tone}`}>{estado.label}</span>
            </div>
            {nombreResponsable && (
              <span className={styles.responsable}>Responsable: <strong>{nombreResponsable}</strong></span>
            )}

            {esAdmin && (
              <div className={styles.logoControl}>
                <input
                  ref={inputLogoRef}
                  id="logo-empresa"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className={styles.inputOculto}
                  onChange={handleLogoChange}
                  disabled={subiendoLogo}
                />
                {logoFile ? (
                  <>
                    <button type="button" className="btn-primary" onClick={handleSubirLogo} disabled={subiendoLogo}>
                      <Icon name="check" size={18} strokeWidth={2.2} />
                      {subiendoLogo ? 'Subiendo...' : 'Guardar logo'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={descartarLogo} disabled={subiendoLogo}>
                      Descartar
                    </button>
                  </>
                ) : (
                  <label htmlFor="logo-empresa" className={`btn-secondary ${styles.labelLogo}`}>
                    <Icon name="image" size={18} />
                    Cambiar logo
                  </label>
                )}
                <span className={styles.logoHint}>PNG, JPG o WEBP · Máximo 2 MB</span>
              </div>
            )}
            {logoError && <p className={styles.logoError} role="alert">{logoError}</p>}
          </div>

          {empresa?.id && (
            <Link to={`/empresa/${empresa.id}`} className={styles.verPublico}>
              Ver perfil público <Icon name="arrowRight" size={16} />
            </Link>
          )}
        </div>
      </Card>

      {/* ── Datos institucionales (solo lectura) ───────────────────────────── */}
      <Card as="section" titleId="sec-institucional" title="Datos institucionales" className={styles.bloque}>
        <dl className={styles.datos}>
          <div><dt>Razón social</dt><dd>{empresa?.razonSocial ?? '—'}</dd></div>
          <div><dt>CUIT</dt><dd>{empresa?.cuit ?? '—'}</dd></div>
          <div><dt>Estado</dt><dd><span className={`badge badge-tone-${estado.tone}`}>{estado.label}</span></dd></div>
          <div className={styles.datoAncho}>
            <dt>Nivel de confianza</dt>
            <dd>
              <span className={`badge badge-tone-${confiable ? 'teal' : 'gray'}`}>
                {confiable && <Icon name="shield" size={14} strokeWidth={2} />}
                {confiable ? 'De confianza' : 'Estándar'}
              </span>
              <p className={styles.ayudaDato}>
                {confiable
                  ? 'Tu empresa cuenta con habilitación institucional para determinadas aprobaciones automáticas.'
                  : 'Las nuevas publicaciones y altas de reclutadores pueden requerir revisión institucional.'}
              </p>
            </dd>
          </div>
        </dl>
        <p className={styles.nota}>
          Para modificar la razón social o el CUIT, contactate con el administrador del sistema.
        </p>
      </Card>

      <form onSubmit={handleSubmit} className={styles.form}>
        {/* ── Perfil público ──────────────────────────────────────────────── */}
        <Card
          as="section" titleId="sec-publico" title="Perfil público"
          subtitle="Lo que ven alumnos y egresados en la página de tu empresa."
          className={styles.bloque}
        >
          <div className={styles.campos}>
            <div className="form-group">
              <label htmlFor="rubro">Rubro / Industria</label>
              <input
                id="rubro" name="rubro" type="text" value={form.rubro} onChange={handleChange}
                placeholder="Ej: Software y Tecnología" disabled={!esAdmin}
              />
            </div>
            <div className="form-group">
              <label htmlFor="sitioWeb">Sitio web</label>
              <input
                id="sitioWeb" name="sitioWeb" type="text" value={form.sitioWeb} onChange={handleChange}
                placeholder="www.empresa.com" disabled={!esAdmin}
              />
            </div>
            <div className={`form-group ${styles.campoAncho}`}>
              <label htmlFor="descripcion">Descripción</label>
              <textarea
                id="descripcion" name="descripcion" value={form.descripcion} onChange={handleChange}
                rows={5} placeholder="Contanos brevemente a qué se dedica tu empresa..." disabled={!esAdmin}
              />
            </div>
          </div>
        </Card>

        {/* ── Contacto y ubicación ────────────────────────────────────────── */}
        <Card as="section" titleId="sec-contacto" title="Contacto y ubicación" className={styles.bloque}>
          <div className={styles.campos}>
            <div className="form-group">
              <label htmlFor="telefono">Teléfono institucional</label>
              <input
                id="telefono" name="telefono" type="tel" value={form.telefono} onChange={handleChange}
                placeholder="Ej: 11-4300-1234" disabled={!esAdmin}
              />
            </div>
            <div className="form-group">
              <label htmlFor="ciudad">Ciudad</label>
              <input
                id="ciudad" name="ciudad" type="text" value={form.ciudad} onChange={handleChange}
                placeholder="Ej: Avellaneda" disabled={!esAdmin}
              />
            </div>
            <div className={`form-group ${styles.campoAncho}`}>
              <label htmlFor="direccion">Dirección</label>
              <input
                id="direccion" name="direccion" type="text" value={form.direccion} onChange={handleChange}
                placeholder="Ej: Av. Mitre 1234" disabled={!esAdmin}
              />
            </div>
          </div>
        </Card>

        {esAdmin && (
          <div className={styles.acciones}>
            <button type="submit" className="btn-primary" disabled={guardando}>
              <Icon name="check" size={18} strokeWidth={2.2} />
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
