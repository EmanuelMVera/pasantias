/**
 * AdminImportacionPage.jsx — Importación masiva de alumnos/egresados por CSV.
 *
 * Flujo: descargar plantilla → seleccionar archivo → previsualizar (dry-run,
 * no escribe nada) → confirmar (crea Usuario+Perfil, envía email de
 * activación) → resumen + reporte de errores descargable.
 *
 * Ruta: /admin/importaciones — rol: admin
 */

import { useState, useRef } from 'react';
import { adminService } from '../../services/api';
import { filasACsv, descargarTexto } from '../../utils/csv';
import styles from './AdminImportacionPage.module.css';

export default function AdminImportacionPage() {
  const [file, setFile] = useState(null);
  const [paso, setPaso] = useState('seleccion'); // 'seleccion' | 'preview' | 'resumen'
  const [analisis, setAnalisis] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const handleDescargarPlantilla = async () => {
    try {
      const res = await adminService.descargarPlantillaImportacion();
      descargarTexto(res.data, 'plantilla-importacion-alumnos.csv');
    } catch {
      setError('No se pudo descargar la plantilla.');
    }
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0] ?? null;
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
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="page-container">
      <div className="dashboard-header">
        <div>
          <h1>Importar alumnos/egresados</h1>
          <p className={styles.subtitle}>Alta masiva por CSV (UTF-8). Exclusivo para administradores.</p>
        </div>
        <button className="btn-secondary" onClick={handleDescargarPlantilla}>
          ⬇️ Descargar plantilla
        </button>
      </div>

      {error && <p className="error-msg" style={{ marginBottom: '1rem' }}>{error}</p>}

      {/* ── Paso 1: selección de archivo ─────────────────────────────── */}
      <div className={styles.card}>
        <h2>1. Seleccioná el archivo CSV</h2>
        <p className={styles.hint}>
          Columnas: <code>legajo,nombre,apellido,email,rol,carrera,anioEgreso,telefono,ubicacion</code>.
          El rol debe ser <code>alumno</code> o <code>egresado</code>.
        </p>
        <div className={styles.fileRow}>
          <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} />
          <button
            className="btn-primary"
            onClick={handlePrevisualizar}
            disabled={!file || cargando}
          >
            {cargando && paso === 'seleccion' ? 'Analizando...' : '🔎 Previsualizar'}
          </button>
        </div>
      </div>

      {/* ── Paso 2: preview (dry-run) ─────────────────────────────────── */}
      {paso === 'preview' && analisis && (
        <div className={styles.card}>
          <h2>2. Previsualización</h2>
          <div className={styles.resumenGrid}>
            <span className={styles.resumenItem}>Total filas: <strong>{analisis.totalFilas}</strong></span>
            <span className={`${styles.resumenItem} ${styles.ok}`}>Válidas: <strong>{analisis.validas}</strong></span>
            <span className={`${styles.resumenItem} ${styles.err}`}>Inválidas: <strong>{analisis.invalidas}</strong></span>
          </div>

          {analisis.invalidas > 0 && (
            <div className={styles.tableWrap}>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Línea</th>
                    <th>Legajo</th>
                    <th>Email</th>
                    <th>Errores</th>
                  </tr>
                </thead>
                <tbody>
                  {analisis.filas.filter((f) => !f.ok).map((f) => (
                    <tr key={f.linea}>
                      <td>{f.linea}</td>
                      <td>{f.fila.legajo || '—'}</td>
                      <td>{f.fila.email || '—'}</td>
                      <td className={styles.errCell}>{f.errores.join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.acciones}>
            {analisis.invalidas > 0 && (
              <button className="btn-secondary" onClick={handleDescargarReporteErrores}>
                ⬇️ Descargar reporte de errores
              </button>
            )}
            <button
              className="btn-primary"
              onClick={handleConfirmar}
              disabled={analisis.validas === 0 || cargando}
              title={analisis.validas === 0 ? 'No hay filas válidas para importar' : undefined}
            >
              {cargando ? 'Importando...' : `✅ Confirmar importación (${analisis.validas})`}
            </button>
          </div>
        </div>
      )}

      {/* ── Paso 3: resumen ──────────────────────────────────────────── */}
      {paso === 'resumen' && resumen && (
        <div className={styles.card}>
          <h2>3. Importación completada</h2>
          <div className={styles.resumenGrid}>
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
            <div className={styles.tableWrap}>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.creados.map((c) => (
                    <tr key={c.id}>
                      <td>{c.nombre} {c.apellido}</td>
                      <td>{c.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.acciones}>
            <button className="btn-secondary" onClick={handleReiniciar}>
              Importar otro archivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
