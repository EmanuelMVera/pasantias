/**
 * validacion.js — reglas de formulario del lado del cliente.
 *
 * Espejo de backend/src/validators/common.validator.js: ANTICIPAN el error
 * para que el usuario lo vea antes de enviar, pero la autoridad es el backend
 * (que valida igual y responde 400 con un mensaje claro). Si cambia una regla
 * allá, cambiarla acá.
 */

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

/** Dígitos, espacios, +, paréntesis y guiones; entre 6 y 15 dígitos. */
export function esTelefonoValido(tel) {
  const t = String(tel ?? '').trim();
  if (!/^\+?[\d\s()-]+$/.test(t)) return false;
  const digitos = t.replace(/\D/g, '').length;
  return digitos >= 6 && digitos <= 15;
}

const CUIT_PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
const CUIT_PREFIJOS = ['20', '23', '24', '25', '26', '27', '30', '33', '34'];

/** CUIT argentino: 11 dígitos (con o sin guiones) y dígito verificador correcto. */
export function esCuitValido(cuit) {
  const t = String(cuit ?? '').trim();
  if (!/^[\d\s-]+$/.test(t)) return false;
  const d = t.replace(/\D/g, '');
  if (d.length !== 11 || !CUIT_PREFIJOS.includes(d.slice(0, 2))) return false;
  const suma = [...d.slice(0, 10)].reduce((acc, n, i) => acc + Number(n) * CUIT_PESOS[i], 0);
  const resto = 11 - (suma % 11);
  const dv = resto === 11 ? 0 : resto;
  return resto !== 10 && dv === Number(d[10]);
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
