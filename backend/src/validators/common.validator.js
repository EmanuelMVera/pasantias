'use strict';

/**
 * common.validator.js — reglas de validación reutilizables (fuente única).
 *
 * El backend es la autoridad: todo dato que se persiste pasa por acá aunque el
 * frontend ya lo haya validado (la API se puede llamar directo).
 *
 * Dos capas:
 *   1. Predicados sueltos (esEmailValido, esTelefonoValido, esCuitValido…).
 *   2. `validarCampos(body, reglas)`: valida y NORMALIZA un conjunto de campos
 *      declarados por tipo. Los validadores de cada formulario solo declaran
 *      sus reglas (ver user/oferta/solicitudEmpresa/empresa.validator.js).
 */

// ── Predicados ──────────────────────────────────────────────────────────────

const EMAIL_MAX = 254;

/**
 * Formato de email razonable (no verifica que el dominio exista).
 * Sin espacios, una @, dominio con punto, máx. 254 caracteres.
 */
function esEmailValido(email) {
  if (typeof email !== 'string' || email.length > EMAIL_MAX) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** trim + lowercase (los emails se guardan y se buscan así). */
function normalizarEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : email;
}

/**
 * Valida que una cadena sea una URL absoluta válida (http o https).
 */
function esUrlValida(url) {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.includes('.');
  } catch {
    return false;
  }
}

/**
 * Teléfono: dígitos, espacios, +, paréntesis y guiones. Entre 6 y 15 dígitos
 * (E.164 admite hasta 15) — sin forzar el formato argentino. "hola" no pasa.
 */
function esTelefonoValido(tel) {
  if (typeof tel !== 'string') return false;
  const t = tel.trim();
  if (!/^\+?[\d\s()-]+$/.test(t)) return false;
  const digitos = t.replace(/\D/g, '').length;
  return digitos >= 6 && digitos <= 15;
}

const CUIT_PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
const CUIT_PREFIJOS = ['20', '23', '24', '25', '26', '27', '30', '33', '34'];

/** Solo los dígitos de un CUIT ("30-71234567-8" → "30712345678"). */
function normalizarCuit(cuit) {
  return String(cuit ?? '').replace(/\D/g, '');
}

/** Dígito verificador AFIP de los 10 primeros dígitos, o null si no tiene uno válido. */
function digitoVerificadorCuit(base10) {
  const suma = [...base10].reduce((acc, d, i) => acc + Number(d) * CUIT_PESOS[i], 0);
  const resto = 11 - (suma % 11);
  if (resto === 11) return 0;
  if (resto === 10) return null; // AFIP reasigna el prefijo en este caso: no es un CUIT emitido
  return resto;
}

/**
 * CUIT argentino válido: 11 dígitos (acepta guiones/espacios), prefijo de tipo
 * conocido y dígito verificador correcto (algoritmo módulo 11 de AFIP).
 */
function esCuitValido(cuit) {
  if (typeof cuit !== 'string' && typeof cuit !== 'number') return false;
  if (!/^[\d\s-]+$/.test(String(cuit).trim())) return false;
  const d = normalizarCuit(cuit);
  if (d.length !== 11 || !CUIT_PREFIJOS.includes(d.slice(0, 2))) return false;
  return digitoVerificadorCuit(d.slice(0, 10)) === Number(d[10]);
}

/** Entero (number o string de dígitos) dentro de [min, max]. Devuelve el número o null. */
function parsearEntero(valor, min, max) {
  let n = valor;
  if (typeof valor === 'string') {
    const t = valor.trim();
    if (!/^-?\d+$/.test(t)) return null;
    n = Number(t);
  }
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function esEnteroEnRango(valor, min, max) {
  return parsearEntero(valor, min, max) !== null;
}

/**
 * Fecha real: "YYYY-MM-DD" (lo que manda un <input type="date">) o ISO 8601
 * completo. Rechaza fechas inexistentes ("2026-02-31") y texto libre.
 * Devuelve un Date o null.
 */
function parsearFecha(valor) {
  if (typeof valor !== 'string') return null;
  const t = valor.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(t);
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const fecha = new Date(t.length === 10 ? `${t}T00:00:00Z` : t);
  if (Number.isNaN(fecha.getTime())) return null;
  // Round-trip de la parte calendario: 2026-02-31 se "corre" a marzo → inválida.
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return fecha;
}

function esFechaValida(valor) {
  return parsearFecha(valor) !== null;
}

// Rangos privados/loopback/link-local IPv4 (incluye 169.254.169.254, metadata
// de nubes). No se hace resolución DNS (sin fetch server-side, por diseño):
// solo se filtra la forma literal del hostname.
const IPV4_PRIVADA = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

function esHostnamePrivado(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (IPV4_PRIVADA.test(h)) return true;
  if (h === '::1' || h === '[::1]' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;
  return false;
}

/**
 * Valida una URL externa para foto_perfil / logo_empresa (solo estos dos
 * usos — nunca para CV/documentos privados). https únicamente, sin
 * credenciales embebidas, sin host privado/loopback/metadata, máx 255
 * caracteres (mismo límite que las columnas STRING(255) existentes:
 * Usuario.fotoPerfil, Perfil.fotoPerfil, Empresa.logo). No hay fetch
 * server-side de esta URL: el filtro de host privado es defensa en
 * profundidad, no una garantía de resolución DNS real.
 */
function esUrlImagenExternaValida(url) {
  if (typeof url !== 'string') return false;
  const u = url.trim();
  if (!u || u.length > 255) return false;
  let parsed;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (!parsed.hostname.includes('.')) return false;
  if (esHostnamePrivado(parsed.hostname)) return false;
  return true;
}

// ── validarCampos ───────────────────────────────────────────────────────────

const vacio = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/**
 * Valida y normaliza los campos de `body` según `reglas`.
 *
 *   reglas = {
 *     titulo:   { tipo: 'texto', label: 'El título', requerido: true, max: 200 },
 *     vacantes: { tipo: 'entero', label: 'Cantidad de vacantes', min: 1, max: 999 },
 *     ...
 *   }
 *
 * Tipos: texto | email | url | telefono | entero | fecha | enum (valores) |
 * booleano | lista (de textos: maxItems, maxItem, valores?) | cuit.
 *
 * - Un campo AUSENTE (undefined) no se valida ni aparece en `datos`, salvo
 *   que sea `requerido` y `parcial` sea false (alta).
 * - Vacío ('' / null / solo espacios) → null en `datos` (o error si es requerido).
 * - Tipos equivocados (un objeto donde va texto, "abc" donde va un número)
 *   son 400: no se convierten silenciosamente.
 *
 * @param {object} body
 * @param {object} reglas
 * @param {{ parcial?: boolean }} [opts] parcial=true → edición (no exige requeridos ausentes)
 * @returns {{ error: string|null, datos: object }}
 */
function validarCampos(body, reglas, { parcial = false } = {}) {
  const datos = {};
  const fuente = body && typeof body === 'object' ? body : {};

  for (const [campo, r] of Object.entries(reglas)) {
    const label = r.label || campo;
    const valor = fuente[campo];

    if (valor === undefined) {
      if (r.requerido && !parcial) return { error: `${label} es obligatorio.`, datos };
      continue;
    }

    // Booleanos y listas tienen su propia noción de "vacío".
    if (r.tipo !== 'booleano' && r.tipo !== 'lista' && vacio(valor)) {
      if (r.requerido) return { error: `${label} es obligatorio.`, datos };
      datos[campo] = null;
      continue;
    }

    const res = validarValor(valor, r, label);
    if (res.error) return { error: res.error, datos };
    datos[campo] = res.valor;
  }

  return { error: null, datos };
}

function validarValor(valor, r, label) {
  switch (r.tipo) {
    case 'texto': {
      if (typeof valor !== 'string') return { error: `${label} debe ser texto.` };
      const t = valor.trim();
      if (r.max && t.length > r.max) return { error: `${label} admite hasta ${r.max} caracteres.` };
      if (r.min && t.length < r.min) return { error: `${label} debe tener al menos ${r.min} caracteres.` };
      return { valor: t };
    }
    case 'email': {
      const e = normalizarEmail(valor);
      if (!esEmailValido(e)) return { error: `${label} no tiene un formato de email válido.` };
      return { valor: e };
    }
    case 'url': {
      const u = typeof valor === 'string' ? valor.trim() : valor;
      const max = r.max ?? 255;
      if (!esUrlValida(u)) return { error: `${label} debe ser una URL válida (que empiece con http:// o https://).` };
      if (u.length > max) return { error: `${label} admite hasta ${max} caracteres.` };
      return { valor: u };
    }
    case 'telefono': {
      if (!esTelefonoValido(valor)) {
        return { error: `${label} no es válido (solo números, espacios, +, paréntesis y guiones).` };
      }
      const t = valor.trim().replace(/\s+/g, ' ');
      if (t.length > (r.max ?? 30)) return { error: `${label} admite hasta ${r.max ?? 30} caracteres.` };
      return { valor: t };
    }
    case 'entero': {
      const n = parsearEntero(valor, r.min ?? Number.MIN_SAFE_INTEGER, r.max ?? Number.MAX_SAFE_INTEGER);
      if (n === null) {
        return { error: `${label} debe ser un número entero entre ${r.min} y ${r.max}.` };
      }
      return { valor: n };
    }
    case 'fecha': {
      const f = parsearFecha(valor);
      if (!f) return { error: `${label} no es una fecha válida (formato AAAA-MM-DD).` };
      return { valor: f };
    }
    case 'enum': {
      if (typeof valor !== 'string' || !r.valores.includes(valor)) {
        return { error: `${label} no es válido. Valores permitidos: ${r.valores.join(', ')}.` };
      }
      return { valor };
    }
    case 'booleano': {
      if (typeof valor === 'boolean') return { valor };
      if (valor === 'true' || valor === 'false') return { valor: valor === 'true' };
      if (r.equivalencias && Object.hasOwn(r.equivalencias, valor)) return { valor: r.equivalencias[valor] };
      return { error: `${label} debe ser verdadero o falso.` };
    }
    case 'lista': {
      let items = valor;
      if (valor === null || valor === '') items = [];
      // Compatibilidad: "a, b, c" (texto separado por comas) además de array.
      else if (typeof valor === 'string') items = valor.split(r.separador ?? ',');
      if (!Array.isArray(items)) return { error: `${label} debe ser una lista.` };
      if (items.some((i) => typeof i !== 'string')) return { error: `${label} solo admite textos.` };
      const limpios = [...new Set(items.map((i) => i.trim()).filter(Boolean))];
      if (r.maxItems && limpios.length > r.maxItems) return { error: `${label} admite hasta ${r.maxItems} elementos.` };
      if (r.maxItem && limpios.some((i) => i.length > r.maxItem)) {
        return { error: `Cada elemento de ${label.toLowerCase()} admite hasta ${r.maxItem} caracteres.` };
      }
      if (r.valores) {
        const invalidos = limpios.filter((i) => !r.valores.includes(i));
        if (invalidos.length) return { error: `${label}: valores no válidos (${invalidos.join(', ')}).` };
      }
      return { valor: limpios };
    }
    case 'cuit': {
      if (!esCuitValido(valor)) return { error: `${label} no es válido: deben ser 11 dígitos con dígito verificador correcto.` };
      return { valor: normalizarCuit(valor) };
    }
    default:
      throw new Error(`validarCampos: tipo desconocido "${r.tipo}"`);
  }
}

module.exports = {
  esEmailValido,
  normalizarEmail,
  esUrlValida,
  esUrlImagenExternaValida,
  esTelefonoValido,
  esCuitValido,
  normalizarCuit,
  digitoVerificadorCuit,
  esEnteroEnRango,
  parsearEntero,
  esFechaValida,
  parsearFecha,
  validarCampos,
};
