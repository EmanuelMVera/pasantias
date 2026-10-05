'use strict';

/**
 * brevo.provider.js — Brevo Transactional Email API por HTTPS
 * (EMAIL_PROVIDER=brevo). Es el proveedor de PRODUCCIÓN: Render Free bloquea
 * el SMTP saliente, pero no el HTTPS.
 *
 *   POST https://api.brevo.com/v3/smtp/email   (envío)
 *   GET  https://api.brevo.com/v3/account      (verificación de la API key; no envía nada)
 *   Header `api-key: BREVO_API_KEY`
 *
 * Sin SDK: es una sola llamada HTTP y Node 22 trae `fetch`; un SDK sumaría una
 * dependencia sin reducir errores en algo tan acotado.
 *
 * El HTML es el mismo que arma el código (templates versionados en el repo, no
 * en el dashboard de Brevo). El remitente sale de BREVO_SENDER_EMAIL /
 * BREVO_SENDER_NAME (no de EMAIL_FROM, que es solo de SMTP).
 *
 * Contrato: igual que smtp.provider.js (recibe `cfg` = config.email de la
 * fachada, no lee el singleton). Nunca lanza. Nunca devuelve ni loguea
 * la API key ni el body completo de la respuesta de Brevo.
 */

const { redactarEmail, normalizarDestinatarios, primeraLinea } = require('../comun');

const API = 'https://api.brevo.com/v3';
const TIMEOUT_MS = 10_000;

/** fetch con timeout (AbortController). Lanza en error de red / timeout. */
async function fetchConTimeout(url, opciones) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opciones, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const headers = (cfg) => ({
  'api-key': cfg.brevo.apiKey,
  accept: 'application/json',
  'content-type': 'application/json',
});

/** Lee el JSON de la respuesta sin romper si no es JSON. */
async function leerJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Traduce una respuesta no-2xx de Brevo a las categorías comunes. Del body
 * solo se conserva `code` y la primera línea de `message` (Brevo devuelve
 * { code: 'unauthorized', message: '...' }).
 */
function describirHttp(status, body) {
  const detalle = [body?.code, primeraLinea(body?.message)].filter(Boolean).join(': ') || `HTTP ${status}`;
  if (status === 401 || status === 403) return { errorCode: 'BREVO_AUTH', categoria: 'auth', status, detalle };
  if (status === 429) return { errorCode: 'BREVO_RATE_LIMIT', categoria: 'envio', status, detalle };
  // 5xx: problema del lado de Brevo, típicamente transitorio → misma familia que la red.
  if (status >= 500) return { errorCode: 'BREVO_HTTP_5XX', categoria: 'red', status, detalle };
  // 400 y otros 4xx: request inválido (p. ej. remitente no verificado, destinatario mal formado).
  return { errorCode: 'BREVO_RECHAZO', categoria: 'envio', status, detalle };
}

function describirExcepcion(err) {
  if (err?.name === 'AbortError') {
    return { errorCode: 'BREVO_TIMEOUT', categoria: 'red', detalle: `Sin respuesta en ${TIMEOUT_MS / 1000} s` };
  }
  // TypeError de fetch: DNS, conexión rechazada, TLS… (err.cause trae el código).
  return { errorCode: 'BREVO_RED', categoria: 'red', detalle: primeraLinea(err?.cause?.code || err?.message) };
}

async function send({ to, subject, html }, cfg) {
  const { senderEmail, senderName } = cfg.brevo;
  const body = {
    sender: { name: senderName, email: senderEmail },
    to: normalizarDestinatarios(to).map((email) => ({ email })),
    subject,
    htmlContent: html,
  };
  try {
    const res = await fetchConTimeout(`${API}/smtp/email`, { method: 'POST', headers: headers(cfg), body: JSON.stringify(body) });
    const json = await leerJson(res);
    if (res.ok) return { ok: true, messageId: json?.messageId ?? json?.messageIds?.[0] };
    return { ok: false, ...describirHttp(res.status, json) };
  } catch (err) {
    return { ok: false, ...describirExcepcion(err) };
  }
}

/**
 * Verifica que la API responde y que la API key es válida (GET /v3/account).
 * No envía emails ni devuelve los datos de la cuenta.
 */
async function verify(cfg) {
  try {
    const res = await fetchConTimeout(`${API}/account`, { method: 'GET', headers: headers(cfg) });
    if (res.ok) return { ok: true };
    return { ok: false, ...describirHttp(res.status, await leerJson(res)) };
  } catch (err) {
    return { ok: false, ...describirExcepcion(err) };
  }
}

function resumen(cfg) {
  const b = cfg.brevo;
  return {
    provider: 'brevo',
    sender: b.senderEmail ? `${b.senderName} <${redactarEmail(b.senderEmail)}>` : '(sin BREVO_SENDER_EMAIL)',
    apiKey: b.apiKey ? 'configurada' : 'FALTA',
  };
}

module.exports = { send, verify, resumen, describirHttp, TIMEOUT_MS };
