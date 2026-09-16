/**
 * seed.js — Script de datos iniciales (seeder).
 *
 * Crea el usuario administrador del sistema si aún no existe.
 * Se ejecuta manualmente una sola vez al configurar el proyecto.
 *
 * Uso: node src/utils/seed.js
 *
 * Credenciales del admin creado:
 * - Email:    admin@pasantias.com
 * - Password: Admin1234!
 *
 * ⚠️ Cambiar la contraseña en producción después del primer acceso.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { sequelize, Usuario } = require('../models');

// SEC-02: en producción, el email/contraseña del admin salen de env — nunca se
// crea con las credenciales por defecto.
const DEFAULT_EMAIL = 'admin@pasantias.com';
const DEFAULT_PASSWORD = 'Admin1234!';
const isProd = process.env.NODE_ENV === 'production';

async function seed() {
  try {
    if (isProd && (!process.env.SEED_ADMIN_EMAIL || !process.env.SEED_ADMIN_PASSWORD)) {
      console.error('❌ En producción, SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD son obligatorios. Abortado.');
      process.exit(1);
    }

    const adminEmail = (process.env.SEED_ADMIN_EMAIL || DEFAULT_EMAIL).trim().toLowerCase();
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || DEFAULT_PASSWORD;

    await sequelize.authenticate();
    console.log('✅ Conectado a la base de datos.');

    // Verifica si el admin ya existe para evitar duplicados
    const existe = await Usuario.findOne({ where: { email: adminEmail } });

    if (existe) {
      console.log('ℹ️  El usuario administrador ya existe:', adminEmail);
      console.log('   La contraseña NO fue modificada (este script nunca actualiza una contraseña existente).');
      console.log('   Para resetearla: usá "Olvidé mi contraseña" en /login (flujo de reset por email).');
    } else {
      const hash = await bcrypt.hash(adminPassword, 12);
      await Usuario.create({
        nombre: 'Admin',
        apellido: 'Sistema',
        email: adminEmail,
        password: hash,
        rol: 'admin',
        habilitado: true,
        activo: true,
      });
      console.log('✅ Usuario admin creado:');
      console.log(`   📧 Email:    ${adminEmail}`);
      if (!isProd && !process.env.SEED_ADMIN_PASSWORD) {
        console.log(`   🔑 Password: ${DEFAULT_PASSWORD}  ⚠️  cambiala tras el primer acceso`);
      } else {
        console.log('   🔑 Password: (la definida en SEED_ADMIN_PASSWORD)');
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Error en seed:', err.message);
    process.exit(1);
  }
}

seed();
