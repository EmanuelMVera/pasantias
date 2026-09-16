'use strict';

/**
 * Valida formato de email con regex simple.
 * Suficiente para input básico; no verifica existencia del dominio.
 */
function esEmailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Valida que una cadena sea una URL absoluta válida (http o https).
 */
function esUrlValida(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
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

module.exports = { esEmailValido, esUrlValida, esUrlImagenExternaValida };
