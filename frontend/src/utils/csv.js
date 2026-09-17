/**
 * csv.js — helpers de export CSV client-side (reporte de errores de la
 * importación masiva de alumnos/egresados). Mismo criterio anti CSV-injection
 * que el backend (backend/src/utils/csv.js): una celda que empieza con
 * =, +, - o @ se prefija con un apóstrofe.
 */

export function escaparCeldaCsv(valor) {
  const s = String(valor ?? '');
  const segura = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(segura) ? `"${segura.replace(/"/g, '""')}"` : segura;
}

/**
 * @param {string[]} headers
 * @param {object[]} filas — cada fila es un objeto con esas claves
 * @returns {string} CSV con BOM, listo para descargar
 */
export function filasACsv(headers, filas) {
  const cuerpo = filas.map((fila) => headers.map((h) => escaparCeldaCsv(fila[h])).join(','));
  return '﻿' + [headers.join(','), ...cuerpo].join('\n');
}

/** Dispara la descarga de un string como archivo en el navegador. */
export function descargarTexto(contenido, nombreArchivo, mimeType = 'text/csv;charset=utf-8;') {
  const url = URL.createObjectURL(new Blob([contenido], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Dispara la descarga de un Blob ya armado (ej. la respuesta binaria de un
 * export xlsx/pdf del backend, `responseType: 'blob'`). El nombre de archivo
 * sale siempre del header `Content-Disposition` que ya arma el servidor
 * (nunca de input del cliente) — se lo pasa el caller, ya parseado.
 */
export function descargarBlob(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Extrae el `filename` de un header Content-Disposition
 * (`attachment; filename="logs-123.csv"`), con un fallback si por algún
 * motivo no viniera.
 */
export function nombreDesdeContentDisposition(header, fallback) {
  const match = /filename="?([^"]+)"?/.exec(header || '');
  return match ? match[1] : fallback;
}
