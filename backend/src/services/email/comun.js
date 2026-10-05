'use strict';

/**
 * comun.js — utilidades compartidas por la fachada (utils/mailer.js) y los
 * proveedores de email. Sin dependencias de config ni de proveedores.
 */

/** "juan.perez@gmail.com" → "ju***@gmail.com" (para logs). */
function redactarEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return '[sin email]';
  const [local, dominio] = email.split('@');
  return `${local.slice(0, 2)}***@${dominio}`;
}

/** `to` admite un string o un array (los callers usan ambos). */
function normalizarDestinatarios(to) {
  return (Array.isArray(to) ? to : [to]).filter((d) => typeof d === 'string' && d.trim());
}

/** Primera línea de un texto, acotada (para logs de errores de proveedores). */
function primeraLinea(texto, max = 200) {
  return String(texto ?? '').split('\n')[0].slice(0, max);
}

module.exports = { redactarEmail, normalizarDestinatarios, primeraLinea };
