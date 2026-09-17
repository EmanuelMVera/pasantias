'use strict';

/**
 * frontendDemoLeak.test.js
 *
 * Regresión para el hallazgo de la profesora: una captura vieja de Vercel
 * seguía mostrando "sistema@demo.com" / "Admin del sistema" en LoginPage,
 * aunque esa cuenta ya no existe en Neon. La causa real fue un deployment
 * desactualizado (ver docs/DEPLOYMENT.md § "Verificar que Vercel sirve el
 * último commit"), no un bug de código — GET /api/demo/status ya construye
 * la lista de cuentas desde seedPresentacion.js (ver demoStatus.test.js) y
 * el frontend la renderiza dinámicamente, nunca hardcodeada.
 *
 * Este test es la red de seguridad para que ese código hardcodeado no
 * vuelva a aparecer: recorre frontend/src y falla si encuentra el email o
 * la etiqueta de la cuenta demo del sistema viejo, sin importar el archivo
 * ni el rol del desarrollador que lo haya escrito.
 */

const fs = require('fs');
const path = require('path');

const FRONTEND_SRC = path.join(__dirname, '../../frontend/src');

const PATRONES_PROHIBIDOS = [
  /sistema@demo\.com/i,
  // Case-sensitive a propósito: así una etiqueta/rol de UI ("Admin del
  // sistema", Title Case, como aparecía en la cuenta demo vieja) se detecta
  // sin generar falsos positivos con prosa genérica en minúscula tipo
  // "oculto para admin del sistema" (un comentario que habla del admin real,
  // no de la cuenta demo eliminada).
  /Admin del [Ss]istema/,
];

function listarArchivosFuente(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listarArchivosFuente(full));
    } else if (/\.(jsx?|css)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('Regresión — sistema@demo.com no debe reaparecer en el frontend', () => {
  test('ningún archivo de frontend/src contiene el email o la etiqueta de la cuenta demo vieja', () => {
    const archivos = listarArchivosFuente(FRONTEND_SRC);
    expect(archivos.length).toBeGreaterThan(0); // guard: si esto da 0, el path está mal

    const hallazgos = [];
    for (const archivo of archivos) {
      const contenido = fs.readFileSync(archivo, 'utf8');
      for (const patron of PATRONES_PROHIBIDOS) {
        if (patron.test(contenido)) {
          hallazgos.push(`${path.relative(FRONTEND_SRC, archivo)} — coincide con ${patron}`);
        }
      }
    }

    expect(hallazgos).toEqual([]);
  });
});
