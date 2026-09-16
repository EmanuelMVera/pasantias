/**
 * adminStatus.js — diagnóstico de solo lectura para el admin del sistema.
 *
 * No crea, no modifica, no borra nada. Sirve para responder "¿el admin ya
 * existe? ¿está activo?" sin tener que consultar la base a mano — útil
 * porque `npm run db:seed:admin` no actualiza una contraseña existente, así
 * que después del primer deploy hace falta poder chequear el estado del
 * admin sin volver a correr el seed.
 *
 * Uso:
 *   npm run db:admin:status -- --email=admin@tudominio.edu
 *   (o, si SEED_ADMIN_EMAIL ya está seteada en el entorno, sin --email)
 *
 * Nunca imprime el hash de la contraseña ni ningún token — ni siquiera se
 * piden esas columnas (ver `attributes` del findOne).
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { sequelize, Usuario } = require('../models');

function leerArgEmail() {
  const arg = process.argv.find((a) => a.startsWith('--email='));
  return arg ? arg.slice('--email='.length) : undefined;
}

async function main() {
  const email = (leerArgEmail() || process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) {
    console.error('Uso: npm run db:admin:status -- --email=admin@tudominio.edu');
    console.error('(o definí SEED_ADMIN_EMAIL en el entorno)');
    process.exit(1);
  }

  await sequelize.authenticate();

  const usuario = await Usuario.findOne({
    where: { email },
    attributes: ['id', 'rol', 'activo', 'habilitado', 'deletedAt', 'createdAt', 'ultimoAcceso'],
    paranoid: false,
  });

  if (!usuario) {
    console.log(`No existe ningún usuario con email "${email}".`);
  } else {
    console.log(`Usuario encontrado: ${email}`);
    console.log(`  rol: ${usuario.rol} · activo: ${usuario.activo} · habilitado: ${usuario.habilitado}`);
    console.log(`  eliminado: ${usuario.deletedAt ? `sí (${usuario.deletedAt.toISOString()})` : 'no'}`);
    console.log(`  creado: ${usuario.createdAt.toISOString()} · último acceso: ${usuario.ultimoAcceso ? usuario.ultimoAcceso.toISOString() : 'nunca'}`);
    if (usuario.rol !== 'admin') {
      console.log('  ⚠️  Este usuario NO tiene rol admin.');
    }
  }

  await sequelize.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
