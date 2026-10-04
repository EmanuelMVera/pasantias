/**
 * MiPerfilReclutadorPage.jsx — "Mi perfil" del RECLUTADOR (sus datos personales).
 *
 * Ruta: /empresa/mi-perfil (solo reclutador: guard `SoloReclutador` en App.jsx).
 * Se llega desde el menú de usuario. El admin_empresa no la usa: su identidad
 * es la empresa (Mi empresa).
 *
 * Consume:
 *   GET   /api/empresas/reclutadores/mi-perfil       → datos (misma forma que la ficha pública)
 *   PATCH /api/empresas/reclutadores/mi-perfil       → nombre, apellido, telefono, ubicacion
 *   POST  /api/empresas/reclutadores/mi-perfil/foto  → foto (imagen validada por el backend)
 *
 * Email, empresa y rol son solo lectura; la contraseña vive en Seguridad.
 * Después de guardar o subir la foto se actualiza AuthContext
 * (`actualizarUsuario`): barra, menú de usuario y chat la reflejan sin recargar.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { empresaService } from '../../services/empresa.service';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Toast from '../../components/ui/Toast';
import Icon from '../../components/ui/Icon';
import Avatar from '../../components/Avatar/Avatar';
import styles from './MiPerfilReclutadorPage.module.css';

const TIPOS_IMAGEN = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGEN = 2 * 1024 * 1024;
const CAMPOS = ['nombre', 'apellido', 'telefono', 'ubicacion'];

const formDesde = (p) => Object.fromEntries(CAMPOS.map((c) => [c, p?.[c] ?? '']));

export default function MiPerfilReclutadorPage() {
  const { actualizarUsuario } = useAuth();
  const { toast, showToast } = useToast(4000);

  const [perfil, setPerfil] = useState(null);
  const [form, setForm] = useState(formDesde(null));
  const [error, setError] = useState('');
  const [errorForm, setErrorForm] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [errorFoto, setErrorFoto] = useState('');
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const inputFotoRef = useRef(null);

  useEffect(() => {
    let vigente = true;
    empresaService.getMiPerfilReclutador()
      .then(({ data }) => { if (vigente) { setPerfil(data.data); setForm(formDesde(data.data)); } })
      .catch(() => { if (vigente) setError('No se pudo cargar tu perfil.'); });
    return () => { vigente = false; };
  }, []);

  useEffect(() => () => { if (fotoPreview) URL.revokeObjectURL(fotoPreview); }, [fotoPreview]);

  const cambios = perfil ? CAMPOS.some((c) => form[c].trim() !== (perfil[c] ?? '')) : false;

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setErrorForm('');
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.apellido.trim()) {
      setErrorForm('El nombre y el apellido no pueden quedar vacíos.');
      return;
    }
    setGuardando(true);
    setErrorForm('');
    try {
      const body = Object.fromEntries(CAMPOS.map((c) => [c, form[c].trim()]));
      const { data } = await empresaService.updateMiPerfilReclutador(body);
      setPerfil(data.data);
      setForm(formDesde(data.data));
      const { nombre, apellido, telefono, ubicacion } = data.data;
      actualizarUsuario({ nombre, apellido, telefono, ubicacion });
      showToast('Perfil actualizado.', 'success');
    } catch (err) {
      setErrorForm(err.response?.data?.message ?? 'No se pudo guardar tu perfil.');
    } finally {
      setGuardando(false);
    }
  };

  // ── Foto (el backend valida tipo real y tamaño; acá solo se anticipa) ──────
  const descartarFoto = () => {
    setFotoFile(null);
    setFotoPreview(null);
    if (inputFotoRef.current) inputFotoRef.current.value = '';
  };

  const handleFotoChange = (e) => {
    const file = e.target.files?.[0];
    setErrorFoto('');
    if (!file) { descartarFoto(); return; }
    if (!TIPOS_IMAGEN.includes(file.type)) {
      descartarFoto();
      setErrorFoto('Solo se aceptan imágenes JPG, PNG o WEBP.');
      return;
    }
    if (file.size > MAX_IMAGEN) {
      descartarFoto();
      setErrorFoto('La imagen no puede superar los 2 MB.');
      return;
    }
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
  };

  const handleSubirFoto = async () => {
    if (!fotoFile) return;
    setSubiendoFoto(true);
    setErrorFoto('');
    try {
      const fd = new FormData();
      fd.append('foto', fotoFile);
      const { data } = await empresaService.subirFotoMiPerfilReclutador(fd);
      setPerfil((prev) => ({ ...prev, fotoPerfil: data.fotoPerfil }));
      actualizarUsuario({ fotoPerfil: data.fotoPerfil });
      descartarFoto();
      showToast('Foto de perfil actualizada.', 'success');
    } catch (err) {
      setErrorFoto(err.response?.data?.message ?? 'No se pudo subir la foto.');
    } finally {
      setSubiendoFoto(false);
    }
  };

  if (error) return <div className="page-container"><p className="error-msg" role="alert">{error}</p></div>;
  if (!perfil) return <div className="page-container"><p className="msg" role="status">Cargando tu perfil...</p></div>;

  const nombreCompleto = `${perfil.nombre} ${perfil.apellido}`.trim();

  return (
    <div className="page-container">
      <Toast toast={toast} />
      <PageHeader title="Mi perfil" subtitle="Tus datos personales dentro del sistema." />

      <div className={styles.contenido}>
        {/* ── Identidad + foto ─────────────────────────────────────────────── */}
        <Card as="section" className={styles.bloque} aria-labelledby="mi-perfil-nombre">
          <div className={styles.identidad}>
            <Avatar src={fotoPreview || perfil.fotoPerfil} nombre={perfil.nombre} apellido={perfil.apellido} size={88} />
            <div className={styles.identidadTexto}>
              <h2 id="mi-perfil-nombre" className={styles.nombre}>{nombreCompleto}</h2>
              <span className={styles.rolEmpresa}>Reclutador · {perfil.empresa.razonSocial}</span>
              <div className={styles.fotoAcciones}>
                <input
                  ref={inputFotoRef}
                  id="mi-perfil-foto"
                  type="file"
                  accept={TIPOS_IMAGEN.join(',')}
                  className={styles.inputArchivo}
                  onChange={handleFotoChange}
                />
                {fotoFile ? (
                  <>
                    <button type="button" className="btn-primary" onClick={handleSubirFoto} disabled={subiendoFoto}>
                      {subiendoFoto ? 'Subiendo…' : 'Guardar foto'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={descartarFoto} disabled={subiendoFoto}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <label htmlFor="mi-perfil-foto" className={`btn-secondary ${styles.botonArchivo}`}>
                    <Icon name="upload" size={16} /> Cambiar foto
                  </label>
                )}
              </div>
              <span className={styles.ayuda}>JPG, PNG o WEBP · máximo 2 MB</span>
              {errorFoto && <p className={`error-msg ${styles.errorFoto}`} role="alert">{errorFoto}</p>}
            </div>
          </div>
        </Card>

        {/* ── Datos personales (editables) ──────────────────────────────────── */}
        <Card as="section" title="Datos personales" titleId="sec-datos" headingLevel={2} className={styles.bloque}>
          <form onSubmit={handleGuardar} noValidate className={styles.form}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="mp-nombre">Nombre</label>
                <input id="mp-nombre" name="nombre" value={form.nombre} onChange={handleChange} maxLength={100} autoComplete="given-name" required />
              </div>
              <div className="form-group">
                <label htmlFor="mp-apellido">Apellido</label>
                <input id="mp-apellido" name="apellido" value={form.apellido} onChange={handleChange} maxLength={100} autoComplete="family-name" required />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="mp-email">Email</label>
              <input id="mp-email" value={perfil.email} readOnly disabled aria-describedby="mp-email-ayuda" />
              <span id="mp-email-ayuda" className={styles.ayuda}>Es tu usuario de acceso: no se modifica desde acá.</span>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="mp-telefono">Teléfono</label>
                <input id="mp-telefono" name="telefono" type="tel" value={form.telefono} onChange={handleChange} maxLength={30} autoComplete="tel" />
              </div>
              <div className="form-group">
                <label htmlFor="mp-ubicacion">Ubicación</label>
                <input id="mp-ubicacion" name="ubicacion" value={form.ubicacion} onChange={handleChange} maxLength={150} placeholder="Ciudad, provincia" />
              </div>
            </div>

            {errorForm && <p className="error-msg" role="alert">{errorForm}</p>}

            <div className={styles.acciones}>
              <button type="submit" className="btn-primary" disabled={!cambios || guardando}>
                {guardando ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </Card>

        {/* ── Cuenta (solo lectura) ─────────────────────────────────────────── */}
        <Card as="section" title="Cuenta" titleId="sec-cuenta" headingLevel={2} className={styles.bloque}>
          <dl className={styles.cuenta}>
            <div>
              <dt>Empresa</dt>
              <dd><Link to={`/empresa/${perfil.empresa.id}`}>{perfil.empresa.razonSocial}</Link></dd>
            </div>
            <div>
              <dt>Rol</dt>
              <dd><span className="badge badge-tone-blue">Reclutador</span></dd>
            </div>
            <div>
              <dt>Contraseña</dt>
              <dd><Link to="/empresa/seguridad">Seguridad de mi cuenta</Link></dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
