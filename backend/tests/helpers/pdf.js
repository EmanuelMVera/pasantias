'use strict';

/**
 * Helpers para inspeccionar un PDF generado por pdfkit desde los tests, sin sumar
 * una librería de lectura de PDF (solo sirven para los PDF que genera este backend).
 */
const zlib = require('zlib');

// Las fuentes estándar de pdfkit codifican en WinAnsi (cp1252). Coincide con latin1 salvo
// en 0x80–0x9F, donde cp1252 tiene signos tipográficos (los reportes usan las rayas "—" y
// "–" en sus títulos). `TextDecoder('windows-1252')` de Node no sirve: lo trata como latin1.
const CP1252_EXTRA = {
  0x85: '…', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
};
const WIN_ANSI = {
  decode: (bytes) => Array.from(bytes, (b) => CP1252_EXTRA[b] ?? String.fromCharCode(b)).join(''),
};

/**
 * Páginas REALES del documento: objetos `/Type /Page` (el `(?![A-Za-z])` deja afuera
 * `/Type /Pages`, el nodo raíz del árbol de páginas).
 */
function contarPaginasPdf(buffer) {
  return (buffer.toString('latin1').match(/\/Type\s*\/Page(?![A-Za-z])/g) || []).length;
}

/**
 * Texto visible del PDF, una línea por operador `TJ`. pdfkit comprime los streams
 * (flate) y escribe el texto de las fuentes estándar como cadenas hexadecimales
 * en latin1 (WinAnsi), a veces partidas por ajustes de kerning dentro del mismo `TJ`.
 */
function textoDePdf(buffer) {
  const crudo = buffer.toString('latin1');
  let texto = '';
  const streams = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = streams.exec(crudo))) {
    let contenido;
    try {
      contenido = zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      continue; // stream que no es flate (imágenes, fuentes): no tiene texto
    }
    for (const tj of contenido.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      texto += [...tj[1].matchAll(/<([0-9a-f]*)>/gi)]
        .map((h) => WIN_ANSI.decode(Buffer.from(h[1], 'hex')))
        .join('') + '\n';
    }
  }
  return texto;
}

module.exports = { contarPaginasPdf, textoDePdf };
