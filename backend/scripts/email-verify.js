#!/usr/bin/env node
/**
 * email-verify.js — diagnóstico del PROVEEDOR de email, sin enviar nada.
 *
 *   npm run email:verify
 *
 * Carga el entorno (.env o las variables del proceso, p. ej. el Shell de
 * Render) y verifica el proveedor elegido en EMAIL_PROVIDER:
 *   brevo → GET https://api.brevo.com/v3/account (la API responde y la key es válida)
 *   smtp  → transporter.verify() (conexión + STARTTLS/TLS + autenticación)
 *
 * Sale con 0 si el proveedor es utilizable; != 0 si no. Nunca imprime la API
 * key, la contraseña SMTP ni ningún otro secreto.
 */

'use strict';

require('dotenv').config({ quiet: true });
const { config } = require('../src/config/env');
const { verificarEmail, resumenConfigEmail } = require('../src/utils/mailer');

// Pistas por categoría. Orientativas: el detalle real es el del proveedor.
function pista(provider, r) {
  if (r.categoria === 'config') {
    return provider === 'brevo'
      ? 'Definí BREVO_API_KEY y BREVO_SENDER_EMAIL (remitente verificado en Brevo).'
      : provider === 'smtp'
        ? 'Definí EMAIL_USER y EMAIL_PASS.'
        : 'Definí EMAIL_PROVIDER=brevo (producción) o smtp (local).';
  }
  if (r.categoria === 'auth') {
    return provider === 'brevo'
      ? 'Brevo rechazó la API key (401/403): generá una nueva en Brevo → SMTP & API → API Keys y actualizá BREVO_API_KEY.'
      : 'Credenciales SMTP rechazadas. En Gmail: EMAIL_PASS debe ser una App Password vigente (requiere verificación en 2 pasos).';
  }
  if (r.categoria === 'red') {
    return provider === 'smtp'
      ? 'No se pudo conectar al servidor SMTP. Si pasa en Render Free: bloquea los puertos 25/465/587 → usá EMAIL_PROVIDER=brevo.'
      : 'No se pudo contactar a la API de Brevo (timeout / red / 5xx). Probá de nuevo; si persiste, revisá el estado de Brevo.';
  }
  return 'Error no clasificado: revisá el detalle.';
}

async function main() {
  const provider = config.email.provider;
  const resumen = resumenConfigEmail();
  console.log(`Proveedor: ${provider}`);
  if (provider === 'brevo') {
    console.log(`Sender:    ${resumen.sender}`);
    console.log(`API key:   ${resumen.apiKey}`);
  } else if (provider === 'smtp') {
    console.log(`Host:      ${resumen.host}:${resumen.port} (${resumen.secure ? 'TLS implícito' : 'STARTTLS'})`);
    console.log(`Usuario:   ${resumen.user}`);
    console.log(`From:      ${resumen.from || '(vacío)'}`);
  }
  console.log(`Required:  ${config.email.required}`);

  const avisos = config.warnings.filter((w) => /^(EMAIL_|BREVO_)/.test(w));
  if (avisos.length) {
    console.log('\nAdvertencias de config:');
    avisos.forEach((w) => console.log(`  - ${w}`));
  }

  console.log('\nVerificando proveedor (no se envía ningún email)...');
  const r = await verificarEmail();
  if (r.ok) {
    console.log('EMAIL verify: OK');
    return 0;
  }
  console.log('EMAIL verify: FALLÓ');
  console.log(`  código:     ${r.errorCode}`);
  if (r.status) console.log(`  HTTP:       ${r.status}`);
  if (r.responseCode) console.log(`  SMTP:       ${r.responseCode}${r.command ? ` (${r.command})` : ''}`);
  console.log(`  categoría:  ${r.categoria}`);
  if (r.detalle) console.log(`  detalle:    ${r.detalle}`);
  console.log(`  pista:      ${pista(provider, r)}`);
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    // Solo el mensaje: nunca el objeto de error completo (podría arrastrar config).
    console.error(`email:verify no pudo ejecutarse: ${err?.message || err}`);
    process.exit(2);
  });
