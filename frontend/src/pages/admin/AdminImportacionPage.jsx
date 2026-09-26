/**
 * AdminImportacionPage.jsx — Importación masiva de alumnos/egresados por CSV.
 *
 * Flujo: descargar plantilla → seleccionar archivo → previsualizar (dry-run,
 * no escribe nada) → confirmar (crea Usuario+Perfil, envía email de
 * activación) → resumen + reporte de errores descargable.
 *
 * Ruta: /admin/importaciones — rol: admin
 */

import { useState } from 'react';
import { adminService } from '../../services/admin.service';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { filasACsv, descargarTexto } from '../../utils/csv';
import Icon from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import FileDropzone from '../../components/ui/FileDropzone';
import TableResponsive from '../../components/ui/TableResponsive';
import DataCard from '../../components/ui/DataCard';
import styles from './AdminImportacionPage.module.css';

// Límites por defecto del backend (CSV_IMPORT_MAX_BYTES / CSV_IMPORT_MAX_ROWS).
const HINT_ARCHIVO = 'CSV UTF-8 · máx. 2 MB · hasta 2000 filas';

export default function AdminImportacionPage() {
  const esTabla = useMediaQuery('(min-width: 1024px)');

  const [file, setFile] = useState(null);
  const [paso, setPaso] = useState('seleccion'); // 'seleccion' | 'preview' | 'resumen'
  const [analisis, setAnalisis] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const handleDescargarPlantilla = async () => {
    try {
      const res = await adminService.descargarPlantillaImportacion();
      descargarTexto(res.data, 'plantilla-importacion-alumnos.csv');
    } catch {
      setError('No se pudo descargar la plantilla.');
    }
  };

  const handleArchivo = (f) => {
    setFile(f);
    setAnalisis(null);
    setResumen(null);
    setError('');
    setPaso('seleccion');
  };

  const handlePrevisualizar = async () => {
    if (!file) return;
    setCargando(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('archivo', file);
      const res = await adminService.previsualizarImportacionCsv(formData);
      setAnalisis(res.data);
      setPaso('preview');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo analizar el archivo.');
    } finally {
      setCargando(false);
    }
  };

  const handleConfirmar = async () => {
    if (!file) return;
    setCargando(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('archivo', file);
      const res = await adminService.confirmarImportacionCsv(formData);
      setResumen(res.data);
      setPaso('resumen');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo confirmar la importación.');
    } finally {
      setCargando(false);
    }
  };

  const handleDescargarReporteErrores = () => {
    if (!analisis?.filas) return;
    const invalidas = analisis.filas.filter((f) => !f.ok);
    const filas = invalidas.map((f) => ({
      linea: f.linea,
      legajo: f.fila.legajo,
      nombre: f.fila.nombre,
      apellido: f.fila.apellido,
      email: f.fila.email,
      rol: f.fila.rol,
      errores: f.errores.join('; '),
    }));
    const csv = filasACsv(['linea', 'legajo', 'nombre', 'apellido', 'email', 'rol', 'errores'], filas);
    descargarTexto(csv, 'reporte-errores-importacion.csv');
  };

  const handleReiniciar = () => {
    setFile(null);
    setAnalisis(null);
    setResumen(null);
    setError('');
    setPaso('seleccion');
  };

  const filasInvalidas = analisis ? analisis.filas.filter((f) => !f.ok) : [];

  return (
    <div className="page-container">
      <PageHeader
        title="Importar alumnos/egresados"
        subtitle="Alta masiva por CSV (UTF-8). Exclusivo para administradores."
        actions={(
          <button type="button" className="btn-secondary" onClick={handleDescargarPlantilla}>
            <Icon name="download" size={18} />
            Descargar plantilla
          </button>
        )}
      />

      {error && <p className={`error-msg ${styles.error}`} role="alert">{error}</p>}

      {/* ── Paso 1: selección de archivo ─────────────────────────────── */}
      <section className={styles.card} aria-labelledby="paso-1">
        <h2 id="paso-1"><span className={styles.pasoNum} aria-hidden="true">1</span><span className={styles.srOnly}>1. </span>Seleccioná el archivo CSV</h2>
        <div className={styles.formato}>
          <Icon name="info" size={18} />
          <p>
            Columnas: <code>legajo, nombre, apellido, email, rol, carrera, anioEgreso, telefono, ubicacion</code>.
            El rol debe ser <code>alumno</code> o <code>egresado</code>.
          </p>
        </div>
        <FileDropzone
          id="archivo-csv"
          label="Archivo CSV de alumnos y egresados"
          accept=".csv,text/csv"
          file={file}
          onFile={handleArchivo}
          disabled={cargando}
          hint={HINT_ARCHIVO}
        />
        <div className={styles.acciones}>
          <button
            type="button"
            className="btn-primary"
            onClick={handlePrevisualizar}
            disabled={!file || cargando}
          >
            <Icon name="eye" size={18} />
            {cargando && paso === 'seleccion' ? 'Analizando...' : 'Previsualizar'}
          </button>
        </div>
      </section>

      {/* ── Paso 2: preview (dry-run) ─────────────────────────────────── */}
      {paso === 'preview' && analisis && (
        <section className={styles.card} aria-labelledby="paso-2">
          <h2 id="paso-2"><span className={styles.pasoNum} aria-hidden="true">2</span><span className={styles.srOnly}>2. </span>Previsualización</h2>
          <div className={styles.resumenGrid} role="status">
            <span className={styles.resumenItem}>Total filas: <strong>{analisis.totalFilas}</strong></span>
            <span className={`${styles.resumenItem} ${styles.ok}`}>Válidas: <strong>{analisis.validas}</strong></span>
            <span className={`${styles.resumenItem} ${styles.err}`}>Inválidas: <strong>{analisis.invalidas}</strong></span>
          </div>

          {analisis.invalidas > 0 && (esTabla ? (
            <TableResponsive minWidth={560}>
              <thead>
                <tr>
                  <th>Línea</th>
                  <th>Legajo</th>
                  <th>Email</th>
                  <th>Errores</th>
                </tr>
              </thead>
              <tbody>
                {filasInvalidas.map((f) => (
                  <tr key={f.linea}>
                    <td>{f.linea}</td>
                    <td>{f.fila.legajo || '—'}</td>
                    <td className="cell-break">{f.fila.email || '—'}</td>
                    <td className={`${styles.errCell} cell-break`}>{f.errores.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </TableResponsive>
          ) : (
            <div className={styles.cards}>
              {filasInvalidas.map((f) => (
                <DataCard
                  key={f.linea}
                  title={`Línea ${f.linea}`}
                  subtitle={f.fila.email || undefined}
                  fields={[
                    { label: 'Legajo', value: f.fila.legajo },
                    { label: 'Errores', value: f.errores.join('; ') },
                  ]}
                />
              ))}
            </div>
          ))}

          <div className={styles.acciones}>
            {analisis.invalidas > 0 && (
              <button type="button" className="btn-secondary" onClick={handleDescargarReporteErrores}>
                <Icon name="download" size={18} />
                Descargar reporte de errores
              </button>
            )}
            <button
              type="button"
              className="btn-primary"
              onClick={handleConfirmar}
              disabled={analisis.validas === 0 || cargando}
              title={analisis.validas === 0 ? 'No hay filas válidas para importar' : undefined}
            >
              <Icon name="check" size={18} strokeWidth={2.2} />
              {cargando ? 'Importando...' : `Confirmar importación (${analisis.validas})`}
            </button>
          </div>
        </section>
      )}

      {/* ── Paso 3: resumen ──────────────────────────────────────────── */}
      {paso === 'resumen' && resumen && (
        <section className={styles.card} aria-labelledby="paso-3">
          <h2 id="paso-3"><span className={styles.pasoNum} aria-hidden="true">3</span><span className={styles.srOnly}>3. </span>Importación completada</h2>
          <div className={styles.resumenGrid} role="status">
            <span className={styles.resumenItem}>Filas procesadas: <strong>{resumen.totalFilas}</strong></span>
            <span className={`${styles.resumenItem} ${styles.ok}`}>Usuarios creados: <strong>{resumen.totalCreados}</strong></span>
            <span className={`${styles.resumenItem} ${styles.err}`}>Filas inválidas: <strong>{resumen.totalInvalidas}</strong></span>
          </div>

          <p className={styles.hint}>
            Se envió un email de activación a cada usuario creado para que elija su contraseña
            (token de un solo uso, válido por 7 días).
          </p>

          {resumen.devTokens?.length > 0 && (
            <div className={styles.devTokensBox}>
              <p><strong>Modo desarrollo</strong> (sin SMTP configurado) — tokens de activación:</p>
              <ul>
                {resumen.devTokens.map((d) => (
                  <li key={d.email}>{d.email}: <code>{d.devToken}</code></li>
                ))}
              </ul>
            </div>
          )}

          {resumen.creados?.length > 0 && (
            <TableResponsive minWidth={320}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {resumen.creados.map((c) => (
                  <tr key={c.id}>
                    <td className="cell-break">{c.nombre} {c.apellido}</td>
                    <td className="cell-break">{c.email}</td>
                  </tr>
                ))}
              </tbody>
            </TableResponsive>
          )}

          <div className={styles.acciones}>
            <button type="button" className="btn-secondary" onClick={handleReiniciar}>
              <Icon name="refresh" size={18} />
              Importar otro archivo
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
