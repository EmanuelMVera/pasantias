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
 * Teléfono ARGENTINO → formato CANÓNICO de persistencia: "+54" + los 10
 * dígitos del número nacional (código de área sin 0 + número sin 15), estilo
 * E.164 sin el 9 de móvil. Ej.: "+541144445555".
 *
 * Acepta las formas que escribe una persona y las legacy:
 *   "11 4444-5555", "(011) 4444-5555", "1144445555", "+54 11 4444-5555",
 *   "+54 9 11 4444-5555", "54 11 4444 5555"
 * Rechaza (null): letras, números que no son argentinos ("+1 …"), y los que no
 * quedan en exactamente 10 dígitos nacionales — p. ej. con el 15 de celular
 * incluido, porque no se puede saber con certeza dónde termina el código de
 * área (el formulario pide "sin 0 y sin 15").
 *
 * @returns {string|null}
 */
function normalizarTelefonoAR(tel) {
  if (typeof tel !== 'string') return null;
  const t = tel.trim();
  if (!t || !/^\+?[\d\s()-]+$/.test(t)) return null;
  let d = t.replace(/\D/g, '');
  if (t.startsWith('+') && !d.startsWith('54')) return null; // otro país
  if (d.startsWith('54') && d.length > 10) {
    d = d.slice(2);
    if (d.length === 11 && d.startsWith('9')) d = d.slice(1); // +54 9 (móvil internacional)
  }
  if (d.startsWith('0')) d = d.slice(1); // 0 de discado nacional
  if (d.length !== 10 || d.startsWith('0')) return null;
  return `+54${d}`;
}

/** Teléfono argentino válido (se puede normalizar al formato canónico). */
function esTelefonoValido(tel) {
  return normalizarTelefonoAR(tel) !== null;
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

/**
 * Normalización prudente de texto: trim exterior y, en textos de UNA línea,
 * espacios/tabulaciones repetidos → uno ("  Peter   Parker " → "Peter Parker").
 * Los textos multilínea solo se recortan (no se tocan sus saltos de línea).
 * Nunca cambia mayúsculas/minúsculas: "S.H.I.E.L.D.", "iOS", "McDonald's"
 * quedan como se escribieron.
 */
function normalizarEspacios(texto) {
  const t = String(texto ?? '').trim();
  return t.includes('\n') ? t : t.replace(/[ \t]+/g, ' ');
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
      const t = normalizarEspacios(valor);
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
      // Se guarda SIEMPRE el canónico (+54 + 10 dígitos), nunca la forma
      // visual: "11-4444-5555" y "(11) 4444 5555" son el mismo dato.
      const canonico = normalizarTelefonoAR(valor);
      if (!canonico) {
        return { error: `${label} no es un teléfono argentino válido: código de área sin 0 y número sin 15 (ej. 11 4444-5555).` };
      }
      return { valor: canonico };
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
      if (!esCuitValido(valor)) {
        // Mensaje según la causa (los tests buscan el prefijo "no es válido").
        const d = normalizarCuit(valor);
        let causa = 'el último dígito (verificador) no corresponde a este CUIT';
        if (!/^[\d\s-]+$/.test(String(valor).trim()) || d.length !== 11) causa = 'deben ser 11 dígitos';
        else if (!CUIT_PREFIJOS.includes(d.slice(0, 2))) causa = 'debe empezar con 20, 23, 24, 27, 30, 33 o 34';
        return { error: `${label} no es válido: ${causa}.` };
      }
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
  normalizarTelefonoAR,
  normalizarEspacios,
  esCuitValido,
  normalizarCuit,
  digitoVerificadorCuit,
  esEnteroEnRango,
  parsearEntero,
  esFechaValida,
  parsearFecha,
  validarCampos,
};
