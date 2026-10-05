#!/usr/bin/env node
/**
 * email-verify.js — diagnóstico SMTP sin enviar ningún email.
 *
 *   npm run email:verify
 *
 * Carga el entorno (.env o las variables del proceso, p. ej. el Shell de
 * Render), muestra la config SMTP SIN secretos (host, puerto, secure, usuario
 * redactado, remitente), las advertencias de config y ejecuta
 * transporter.verify(): conexión + STARTTLS/TLS + autenticación.
 *
 * Sale con código 0 si el servidor SMTP acepta las credenciales; != 0 si no.
 * Nunca imprime EMAIL_PASS ni ningún otro secreto.
 */

'use strict';

require('dotenv').config({ quiet: true });
const { config } = require('../src/config/env');
const { verificarSmtp, resumenConfigSmtp } = require('../src/utils/mailer');

// Pistas por código/respuesta SMTP. Orientativas: el detalle real es el que
// devuelve el servidor (línea "detalle").
function pista(r) {
  if (r.categoria === 'config') return 'Faltan EMAIL_USER y/o EMAIL_PASS en este entorno.';
  if (r.categoria === 'auth') {
    return 'Credenciales rechazadas. En Gmail: EMAIL_USER debe ser la cuenta completa y EMAIL_PASS una '
      + 'App Password vigente (requiere verificación en 2 pasos; no sirve la contraseña normal; '
      + 'si cambiaste la contraseña de la cuenta, las App Passwords anteriores se revocan).';
  }
  if (r.categoria === 'red') {
    return 'No se pudo conectar al servidor SMTP (timeout / conexión rechazada). Si esto pasa en el '
      + 'servidor pero no en tu máquina, el proveedor de hosting probablemente bloquea el tráfico '
      + 'SMTP saliente (puertos 25/465/587): verificá el plan o usá un proveedor de email por API/HTTPS.';
  }
  return 'Error de SMTP no clasificado: revisá el detalle.';
}

async function main() {
  const smtp = resumenConfigSmtp();
  console.log('Config SMTP (sin secretos):');
  console.log(`  host:     ${smtp.host}`);
  console.log(`  port:     ${smtp.port}`);
  console.log(`  secure:   ${smtp.secure} ${smtp.secure ? '(TLS implícito)' : '(STARTTLS)'}`);
  console.log(`  user:     ${smtp.user}`);
  console.log(`  from:     ${smtp.from || '(vacío)'}`);
  console.log(`  required: ${config.email.required}`);

  const avisos = config.warnings.filter((w) => w.startsWith('EMAIL_'));
  if (avisos.length) {
    console.log('\nAdvertencias de config:');
    avisos.forEach((w) => console.log(`  - ${w}`));
  }

  console.log('\nEjecutando transporter.verify() (no se envía ningún email)...');
  const r = await verificarSmtp();
  if (r.ok) {
    console.log('SMTP verify: OK — el servidor aceptó la conexión y la autenticación.');
    return 0;
  }
  console.log('SMTP verify: FALLÓ');
  console.log(`  código:     ${r.errorCode}`);
  if (r.responseCode) console.log(`  respuesta:  ${r.responseCode}`);
  if (r.command) console.log(`  comando:    ${r.command}`);
  console.log(`  categoría:  ${r.categoria}`);
  console.log(`  detalle:    ${r.detalle}`);
  console.log(`  pista:      ${pista(r)}`);
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    // Solo el mensaje: nunca el objeto de error completo (podría arrastrar config).
    console.error(`email:verify no pudo ejecutarse: ${err?.message || err}`);
    process.exit(2);
  });
