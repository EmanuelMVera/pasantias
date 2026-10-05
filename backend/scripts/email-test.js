#!/usr/bin/env node
/**
 * email-test.js — envía UN email de prueba real (uso manual).
 *
 *   npm run email:test -- destinatario@dominio.com
 *
 * El destinatario va por argumento: nunca se guarda en el repo. Usa el mismo
 * camino que la app (enviarEmail), así que también prueba EMAIL_FROM y la
 * entrega real (verify solo prueba la autenticación). No imprime secretos.
 * Sin endpoint HTTP: solo se puede correr con acceso al entorno.
 */

'use strict';

require('dotenv').config({ quiet: true });
const { enviarEmail, verificarSmtp, resumenConfigSmtp } = require('../src/utils/mailer');
const { esEmailValido, normalizarEmail } = require('../src/validators/common.validator');

async function main() {
  const destino = normalizarEmail(process.argv[2] || '');
  if (!esEmailValido(destino)) {
    console.error('Uso: npm run email:test -- destinatario@dominio.com');
    return 2;
  }

  const smtp = resumenConfigSmtp();
  console.log(`SMTP ${smtp.host}:${smtp.port} (secure=${smtp.secure}) como ${smtp.user}, from ${smtp.from || '(vacío)'}`);

  const v = await verificarSmtp();
  if (!v.ok) {
    console.log(`verify falló (${v.errorCode}${v.responseCode ? ` ${v.responseCode}` : ''}): ${v.detalle}`);
    console.log('Corré `npm run email:verify` para ver el diagnóstico completo.');
    return 1;
  }

  const r = await enviarEmail({
    to: destino,
    tipo: 'prueba_manual',
    subject: 'Prueba de correo – SisPasantías',
    html: `<p>Este es un email de prueba de SisPasantías enviado el ${new Date().toISOString()}.</p>
      <p>Si lo recibiste, el envío desde este entorno funciona.</p>`,
  });
  if (r.ok) {
    console.log(`Enviado. messageId: ${r.messageId}`);
    console.log('Revisá la bandeja de entrada (y spam) del destinatario.');
    return 0;
  }
  console.log(`No se pudo enviar (${r.errorCode}, categoría ${r.categoria}).`);
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`email:test no pudo ejecutarse: ${err?.message || err}`);
    process.exit(2);
  });
