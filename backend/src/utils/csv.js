'use strict';

/**
 * csv.js — escape de celdas para cualquier CSV generado por el servidor
 * (export de logs, reporte de errores de importación, etc.).
 *
 * Previene CSV injection (fórmulas que Excel/Sheets ejecutan al abrir el
 * archivo): una celda que empieza con =, +, - o @ se prefija con un
 * apóstrofe, que la mayoría de los lectores de planillas tratan como
 * "forzar texto" y no como parte de la fórmula.
 */
function escaparCeldaCsv(valor) {
  const s = valor == null ? '' : String(valor);
  const segura = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(segura) ? `"${segura.replace(/"/g, '""')}"` : segura;
}

module.exports = { escaparCeldaCsv };
