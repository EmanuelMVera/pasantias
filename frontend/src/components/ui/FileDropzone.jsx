/**
 * FileDropzone.jsx — zona para elegir un archivo: click/teclado (input file real)
 * o arrastrar y soltar.
 *
 *   <FileDropzone
 *     id="archivo-csv" label="Archivo CSV" accept=".csv,text/csv"
 *     file={file} onFile={setFile} disabled={cargando}
 *     hint="CSV UTF-8 · máx. 2 MB · hasta 2000 filas"
 *   />
 *
 * - El <input type="file"> es real (oculto visualmente pero enfocable): el label
 *   de la zona lo activa con click, Enter o Espacio, y muestra anillo de foco.
 * - Componente controlado: `file` es un File o null; `onFile(file | null)`.
 *   Si `file` vuelve a null desde afuera, se limpia el input.
 * - Al soltar se valida la extensión (las de `accept` que empiezan con ".");
 *   si no coincide se muestra un aviso y no se llama a onFile.
 */

import { useEffect, useRef, useState } from 'react';
import styles from './FileDropzone.module.css';

function formatearTamano(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function FileDropzone({ id, label, accept, file, onFile, disabled = false, hint }) {
  const inputRef = useRef(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [aviso, setAviso] = useState('');

  const extensiones = (accept || '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.startsWith('.'));

  useEffect(() => {
    if (!file && inputRef.current) inputRef.current.value = '';
  }, [file]);

  const elegir = (f) => {
    if (!f) return;
    if (extensiones.length && !extensiones.some((ext) => f.name.toLowerCase().endsWith(ext))) {
      setAviso(`Solo se aceptan archivos ${extensiones.join(', ')}.`);
      return;
    }
    setAviso('');
    onFile(f);
  };

  const onChange = (e) => {
    elegir(e.target.files?.[0] ?? null);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setArrastrando(false);
    if (disabled) return;
    elegir(e.dataTransfer?.files?.[0] ?? null);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    if (!disabled) setArrastrando(true);
  };

  const quitar = () => {
    setAviso('');
    onFile(null);
  };

  return (
    <div className={styles.wrap}>
      <label
        htmlFor={id}
        className={`${styles.zona} ${arrastrando ? styles.arrastrando : ''} ${disabled ? styles.deshabilitada : ''}`.trim()}
        onDragOver={onDragOver}
        onDragLeave={() => setArrastrando(false)}
        onDrop={onDrop}
      >
        <span className={styles.icono} aria-hidden="true">📄</span>
        <span className={styles.titulo}>{label}</span>
        <span className={styles.instruccion}>
          Arrastrá el archivo acá o <span className={styles.enlace}>elegilo desde tu equipo</span>
        </span>
        {hint && <span className={styles.hint}>{hint}</span>}
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          className={styles.input}
          onChange={onChange}
          disabled={disabled}
        />
      </label>

      {aviso && <p className={styles.aviso} role="alert">{aviso}</p>}

      {file && (
        <div className={styles.seleccionado} role="status">
          <span className={styles.nombre}>
            <strong>{file.name}</strong>
            <small>{formatearTamano(file.size)}</small>
          </span>
          <button type="button" className={styles.quitar} onClick={quitar} disabled={disabled} aria-label={`Quitar archivo ${file.name}`}>
            Quitar
          </button>
        </div>
      )}
    </div>
  );
}
