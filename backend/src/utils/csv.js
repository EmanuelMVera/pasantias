'use strict';

/**
 * csv.js — escape de celdas para cualquier archivo tabular generado por el
 * servidor (export de logs/estadísticas en CSV o Excel, reporte de errores
 * de importación, etc.).
 *
 * neutralizarFormula(): previene CSV/Excel injection (fórmulas que Excel/
 * Sheets ejecutan al abrir el archivo) — una celda que empieza con =, +, -
 * o @ se prefija con un apóstrofe, que la mayoría de los lectores de
 * planillas tratan como "forzar texto" y no como parte de la fórmula. Vale
 * tanto para una celda de texto de CSV como para el valor de una celda de
 * Excel (exceljs) — por eso vive separada del quoting propio de CSV.
 *
 * escaparCeldaCsv(): neutralizarFormula() + el quoting de comas/comillas/
 * saltos de línea que exige el formato CSV en particular (innecesario en
 * Excel, donde cada celda ya es un valor tipado, no una línea de texto).
 */
function neutralizarFormula(valor) {
  const s = valor == null ? '' : String(valor);
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
}

function escaparCeldaCsv(valor) {
  const segura = neutralizarFormula(valor);
  return /[",\n]/.test(segura) ? `"${segura.replace(/"/g, '""')}"` : segura;
}

module.exports = { escaparCeldaCsv, neutralizarFormula };
