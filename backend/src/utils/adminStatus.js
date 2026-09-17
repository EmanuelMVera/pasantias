/**
 * adminStatus.js — diagnóstico de solo lectura para el/los admin(es) del sistema.
 *
 * No crea, no modifica, no borra nada. Sirve para responder "¿el admin ya
 * existe? ¿está activo?" sin tener que consultar la base a mano — útil
 * porque `npm run db:seed:admin` no actualiza una contraseña existente, así
 * que después del primer deploy hace falta poder chequear el estado del
 * admin sin volver a correr el seed.
 *
 * Acepta uno o varios emails (segundo administrador — ver docs/DEPLOYMENT.md):
 *
 *   npm run db:admin:status -- --email=admin@tudominio.edu
 *   npm run db:admin:status -- --email=a@x.com --email=b@x.com
 *   npm run db:admin:status -- --email=a@x.com,b@x.com
 *   (sin --email: usa SEED_ADMIN_EMAIL y, si está seteada, SEED_SECOND_ADMIN_EMAIL)
 *
 * Nunca imprime el hash de la contraseña ni ningún token — ni siquiera se
 * piden esas columnas (ver `attributes` del findOne).
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { sequelize, Usuario } = require('../models');

function leerArgsEmail() {
  const args = process.argv.filter((a) => a.startsWith('--email='));
  const emails = args.flatMap((a) => a.slice('--email='.length).split(','));
  return [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

function leerEmailsDefaultDeEnv() {
  return [process.env.SEED_ADMIN_EMAIL, process.env.SEED_SECOND_ADMIN_EMAIL]
    .filter(Boolean)
    .map((e) => e.trim().toLowerCase());
}

async function reportarUno(email) {
  const usuario = await Usuario.findOne({
    where: { email },
    attributes: ['id', 'rol', 'activo', 'habilitado', 'deletedAt', 'createdAt', 'ultimoAcceso'],
    paranoid: false,
  });

  if (!usuario) {
    console.log(`No existe ningún usuario con email "${email}".`);
    return;
  }
  console.log(`Usuario encontrado: ${email}`);
  console.log(`  rol: ${usuario.rol} · activo: ${usuario.activo} · habilitado: ${usuario.habilitado}`);
  console.log(`  eliminado: ${usuario.deletedAt ? `sí (${usuario.deletedAt.toISOString()})` : 'no'}`);
  console.log(`  creado: ${usuario.createdAt.toISOString()} · último acceso: ${usuario.ultimoAcceso ? usuario.ultimoAcceso.toISOString() : 'nunca'}`);
  if (usuario.rol !== 'admin') {
    console.log('  ⚠️  Este usuario NO tiene rol admin.');
  }
}

async function main() {
  const emails = leerArgsEmail().length > 0 ? leerArgsEmail() : leerEmailsDefaultDeEnv();
  if (emails.length === 0) {
    console.error('Uso: npm run db:admin:status -- --email=admin@tudominio.edu [--email=otro@x.com]');
    console.error('(o definí SEED_ADMIN_EMAIL / SEED_SECOND_ADMIN_EMAIL en el entorno)');
    process.exit(1);
  }

  await sequelize.authenticate();

  for (const [i, email] of emails.entries()) {
    if (i > 0) console.log('');
    await reportarUno(email);
  }

  await sequelize.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
