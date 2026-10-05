/**
 * validacion.js — reglas de formulario del lado del cliente: decide si un
 * valor es VÁLIDO (la forma/normalización vive en utils/formatos.js).
 *
 * Espejo de backend/src/validators/common.validator.js: ANTICIPAN el error
 * para que el usuario lo vea antes de enviar, pero la autoridad es el backend
 * (que valida igual y responde 400 con un mensaje claro). Si cambia una regla
 * allá, cambiarla acá.
 */

import { normalizarTelefonoAR, partirTelefonoAR, soloDigitos } from './formatos';

export function esEmailValido(email) {
  return typeof email === 'string' && email.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** URL absoluta http/https con dominio. */
export function esUrlValida(url) {
  try {
    const u = new URL(String(url).trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.');
  } catch {
    return false;
  }
}

/** Teléfono argentino interpretable (se puede llevar al canónico +54 + 10 dígitos). */
export function esTelefonoValido(tel) {
  return normalizarTelefonoAR(tel) !== null;
}

/**
 * Mensaje de error del teléfono (para mostrar junto al campo), o ''.
 * Vacío → '' (si es obligatorio, se chequea aparte).
 */
export function errorTelefonoAR(valor) {
  if (!String(valor ?? '').trim() || esTelefonoValido(valor)) return '';
  const { codigoArea, numero } = partirTelefonoAR(valor);
  if (!codigoArea) return 'Completá el código de área (sin 0). Ej.: 11.';
  if (!numero) return 'Completá el número (sin 15).';
  return 'El código de área y el número tienen que sumar 10 dígitos, sin 0 ni 15. Ej.: 11 4444-5555.';
}

const CUIT_PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
const CUIT_PREFIJOS = ['20', '23', '24', '25', '26', '27', '30', '33', '34'];

/** CUIT argentino: 11 dígitos (con o sin guiones) y dígito verificador correcto. */
export function esCuitValido(cuit) {
  const t = String(cuit ?? '').trim();
  if (!/^[\d\s-]+$/.test(t)) return false;
  const d = soloDigitos(t);
  if (d.length !== 11 || !CUIT_PREFIJOS.includes(d.slice(0, 2))) return false;
  const suma = [...d.slice(0, 10)].reduce((acc, n, i) => acc + Number(n) * CUIT_PESOS[i], 0);
  const resto = 11 - (suma % 11);
  const dv = resto === 11 ? 0 : resto;
  return resto !== 10 && dv === Number(d[10]);
}

/**
 * Mensaje de error del CUIT (para mostrar junto al campo), o ''.
 * Vacío → '' (si es obligatorio, se chequea aparte).
 */
export function errorCuit(valor) {
  const d = soloDigitos(valor);
  if (!d) return '';
  if (d.length !== 11) return 'El CUIT debe tener 11 dígitos.';
  return esCuitValido(d) ? '' : 'El dígito verificador del CUIT no es válido.';
}

/** Entero (number o texto de dígitos) dentro de [min, max]. */
export function esEnteroEnRango(valor, min, max) {
  const t = String(valor ?? '').trim();
  if (!/^-?\d+$/.test(t)) return false;
  const n = Number(t);
  return Number.isInteger(n) && n >= min && n <= max;
}

/**
 * Valida campos opcionales: devuelve el primer mensaje de error o ''.
 *
 *   primerError([
 *     [form.sitioWeb, esUrlValida, 'El sitio web debe empezar con https://'],
 *     [form.telefono, esTelefonoValido, 'El teléfono no es válido.'],
 *   ])
 *
 * Un valor vacío se considera válido (para obligatorios, chequear aparte).
 */
export function primerError(reglas) {
  for (const [valor, valido, mensaje] of reglas) {
    const vacio = valor == null || String(valor).trim() === '';
    if (!vacio && !valido(valor)) return mensaje;
  }
  return '';
}

/**
 * Lleva el foco (y el scroll) al primer campo con error, en el orden dado.
 * `errores` = { idDelCampo: mensaje }. Devuelve true si había alguno.
 */
export function enfocarPrimerError(ordenIds, errores) {
  const id = ordenIds.find((k) => errores[k]);
  if (!id) return false;
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  }
  return true;
}
