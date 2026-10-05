/**
 * formatos.js — cómo se PRESENTAN y se NORMALIZAN los datos en la UI.
 *
 *   INPUT HUMANO → formateo visual → normalización → validación → canónico (API/BD)
 *
 * Formatos canónicos (los mismos que guarda el backend, que es la autoridad y
 * vuelve a normalizar todo — ver backend/src/validators/common.validator.js):
 *   CUIT     → 11 dígitos sin guiones          "30999999979"
 *   Teléfono → "+54" + 10 dígitos nacionales   "+541144445555"
 *
 * Presentación (solo para mostrar; NUNCA se guarda así):
 *   CUIT     → "30-99999997-9"
 *   Teléfono → "+54 11 4444-5555"
 *
 * Este archivo decide la FORMA; utils/validacion.js decide si es VÁLIDO.
 */

/** Solo los dígitos de un valor ("30-99999997-9" → "30999999979"). */
export function soloDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

/** trim + espacios repetidos colapsados en textos de una línea (sin tocar mayúsculas). */
export function normalizarEspacios(texto) {
  const t = String(texto ?? '').trim();
  return t.includes('\n') ? t : t.replace(/[ \t]+/g, ' ');
}

// ── CUIT ─────────────────────────────────────────────────────────────────────

/** Canónico: hasta 11 dígitos, sin guiones ni espacios. */
export function normalizarCuit(valor) {
  return soloDigitos(valor).slice(0, 11);
}

/**
 * Formato visual progresivo mientras se escribe: "30", "30-9999", "30-99999997-9".
 * Los guiones los agrega el sistema (no cuentan para el máximo de 11 dígitos).
 */
export function formatearCuit(valor) {
  const d = normalizarCuit(valor);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

/** Para mostrar un CUIT guardado: "30-99999997-9". Si no tiene 11 dígitos, tal cual. */
export function formatearCuitParaVista(valor) {
  if (!valor) return '';
  return soloDigitos(valor).length === 11 ? formatearCuit(valor) : String(valor);
}

// ── Teléfono argentino ───────────────────────────────────────────────────────

/**
 * Códigos de área de 3 dígitos (sin el 0). El 11 (AMBA) es el único de 2; el
 * resto son de 4. Solo se usa para PARTIR un número guardado en código de área
 * + número al mostrarlo/editarlo: el dato canónico no depende de esto.
 */
const AREAS_3_DIGITOS = new Set([
  '220', '221', '223', '230', '236', '237', '249', '260', '261', '263', '264', '266',
  '280', '291', '294', '297', '298', '299', '336', '341', '342', '343', '345', '348',
  '351', '353', '358', '362', '364', '370', '376', '379', '380', '381', '383', '385',
  '387', '388',
]);

function largoCodigoArea(nacional) {
  if (nacional.startsWith('11')) return 2;
  if (AREAS_3_DIGITOS.has(nacional.slice(0, 3))) return 3;
  return 4;
}

/**
 * Canónico "+54" + 10 dígitos, o null si no se puede interpretar sin ambigüedad.
 * Mismo criterio que el backend (normalizarTelefonoAR): acepta "11 4444-5555",
 * "(011) 4444-5555", "+54 9 11 4444-5555", etc.; rechaza el 15 de celular.
 */
export function normalizarTelefonoAR(valor) {
  const t = String(valor ?? '').trim();
  if (!t || !/^\+?[\d\s()-]+$/.test(t)) return null;
  let d = soloDigitos(t);
  if (t.startsWith('+') && !d.startsWith('54')) return null;
  if (d.startsWith('54') && d.length > 10) {
    d = d.slice(2);
    if (d.length === 11 && d.startsWith('9')) d = d.slice(1);
  }
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length !== 10 || d.startsWith('0')) return null;
  return `+54${d}`;
}

/**
 * Valor del campo → { codigoArea, numero } para los dos inputs.
 *   - Mientras se edita, TelefonoArgentinaInput guarda "+54 <área> <número>"
 *     (con espacios): se parte por los espacios, sin adivinar.
 *   - Un valor guardado (canónico o legacy interpretable) se parte por el
 *     código de área conocido.
 *   - Un legacy que no se puede interpretar va entero a `numero` (el usuario lo
 *     corrige; nunca se modifica solo).
 */
export function partirTelefonoAR(valor) {
  const t = String(valor ?? '');
  if (!t.trim()) return { codigoArea: '', numero: '' };
  const enEdicion = /^\+54 (\d*) (\d*)$/.exec(t);
  if (enEdicion) return { codigoArea: enEdicion[1], numero: enEdicion[2] };
  const canonico = normalizarTelefonoAR(t);
  if (!canonico) return { codigoArea: '', numero: soloDigitos(t) };
  const nacional = canonico.slice(3);
  const largo = largoCodigoArea(nacional);
  return { codigoArea: nacional.slice(0, largo), numero: nacional.slice(largo) };
}

/** Valor de edición a partir de las dos partes ('' si ambas están vacías). */
export function unirTelefonoAR(codigoArea, numero) {
  return codigoArea || numero ? `+54 ${codigoArea} ${numero}` : '';
}

/** "44445555" → "4444-5555" · "4445555" → "444-5555" · "445555" → "44-5555". */
export function formatearNumeroTelefono(numero) {
  const d = soloDigitos(numero);
  if (d.length < 6) return d;
  return `${d.slice(0, d.length - 4)}-${d.slice(-4)}`;
}

/** Para mostrar un teléfono guardado: "+54 11 4444-5555". Si no es interpretable, tal cual. */
export function formatearTelefonoParaVista(valor) {
  if (!valor) return '';
  if (!normalizarTelefonoAR(valor)) return String(valor);
  const { codigoArea, numero } = partirTelefonoAR(normalizarTelefonoAR(valor));
  return `+54 ${codigoArea} ${formatearNumeroTelefono(numero)}`;
}

// ── URL ──────────────────────────────────────────────────────────────────────

/**
 * Completa "empresa.com" → "https://empresa.com" solo cuando no hay ambigüedad
 * (sin protocolo y con forma de dominio). Lo demás se devuelve igual y lo
 * valida el backend.
 */
export function completarUrl(valor) {
  const t = String(valor ?? '').trim();
  if (!t || /^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t;
  return /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t) ? `https://${t}` : t;
}
