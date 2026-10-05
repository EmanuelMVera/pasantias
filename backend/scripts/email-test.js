#!/usr/bin/env node
/**
 * email-test.js — envía UN email de prueba real por el proveedor configurado.
 *
 *   npm run email:test -- destinatario@dominio.com
 *
 * Un comando = un email a UN destinatario (se rechaza más de un argumento). El
 * destinatario va por argumento: nunca se guarda en el repo. Usa el mismo
 * camino que la app (enviarEmail), así prueba también el remitente y la
 * entrega real (email:verify solo prueba credenciales). No imprime secretos.
 * Sin endpoint HTTP: solo se puede correr con acceso al entorno.
 */

'use strict';

require('dotenv').config({ quiet: true });
const { config } = require('../src/config/env');
const { enviarEmail, verificarEmail, resumenConfigEmail } = require('../src/utils/mailer');
const { esEmailValido, normalizarEmail } = require('../src/validators/common.validator');

async function main() {
  const args = process.argv.slice(2);
  const destino = normalizarEmail(args[0] || '');
  if (args.length !== 1 || !esEmailValido(destino)) {
    console.error('Uso: npm run email:test -- destinatario@dominio.com   (un único destinatario)');
    return 2;
  }

  const resumen = resumenConfigEmail();
  console.log(`Proveedor: ${config.email.provider}${resumen.sender ? ` · sender ${resumen.sender}` : ''}${resumen.host ? ` · ${resumen.host}:${resumen.port}` : ''}`);

  const v = await verificarEmail();
  if (!v.ok) {
    console.log(`La verificación falló (${v.errorCode}${v.status ? ` HTTP ${v.status}` : ''}): ${v.detalle || ''}`);
    console.log('Corré `npm run email:verify` para ver el diagnóstico completo. No se envió nada.');
    return 1;
  }

  const r = await enviarEmail({
    to: destino,
    tipo: 'prueba_manual',
    subject: 'Prueba de correo – SisPasantías',
    html: `<p>Este es un email de prueba de SisPasantías enviado el ${new Date().toISOString()}
      por el proveedor <strong>${config.email.provider}</strong>.</p>
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
