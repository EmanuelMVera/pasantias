/**
 * ExportMenu.jsx — botón desplegable de exportación (CSV/Excel/PDF).
 *
 * `onExport(format)` hace el trabajo real (llamar al servicio, disparar la
 * descarga del blob) y devuelve una Promise — ExportMenu solo se ocupa de la
 * UI del menú (abrir/cerrar, click afuera, Escape) y de deshabilitarse
 * mientras exporta. Los errores los maneja el caller (así cada página usa su
 * propio Toast en vez de que este componente imponga uno).
 *
 *   <ExportMenu formats={['csv', 'xlsx', 'pdf']} onExport={handleExport} />
 */

import { useState, useRef, useEffect } from 'react';
import styles from './ExportMenu.module.css';

const ETIQUETAS = { csv: 'CSV', xlsx: 'Excel (.xlsx)', pdf: 'PDF' };
const ICONOS = { csv: '📄', xlsx: '📊', pdf: '📕' };

export default function ExportMenu({ formats = ['xlsx', 'pdf'], onExport, label = 'Exportar', disabled = false, id }) {
  const [abierto, setAbierto] = useState(false);
  const [exportando, setExportando] = useState(null); // formato en curso, o null
  const ref = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    const onKey = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [abierto]);

  const elegir = async (formato) => {
    setAbierto(false);
    setExportando(formato);
    try {
      await onExport(formato);
    } finally {
      setExportando(null);
    }
  };

  const ocupado = exportando !== null;

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        id={id}
        className="btn-secondary"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="true"
        aria-expanded={abierto}
        disabled={disabled || ocupado}
      >
        {ocupado ? `Generando ${ETIQUETAS[exportando]}…` : `⬇️ ${label}`}
      </button>
      {abierto && (
        <div className={styles.menu} role="menu">
          {formats.map((f) => (
            <button
              key={f}
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => elegir(f)}
            >
              <span aria-hidden="true">{ICONOS[f] || '⬇️'}</span> {ETIQUETAS[f] || f.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
