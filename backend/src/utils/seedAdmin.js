/**
 * seedAdmin.js — Script de alta de administrador(es) del sistema.
 *
 * Crea el usuario administrador primario si aún no existe, y opcionalmente
 * un segundo administrador (uso previsto: un compañero de equipo con su
 * propia cuenta — nunca se comparte contraseña entre personas).
 *
 * Uso: node src/utils/seedAdmin.js
 *
 * Variables de entorno (ninguna contraseña se hardcodea ni se loguea):
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD               — admin primario.
 *     Obligatorias en producción. En dev, si faltan, se usa
 *     admin@pasantias.com / Admin1234! (cambiar tras el primer acceso).
 *   SEED_SECOND_ADMIN_EMAIL / SEED_SECOND_ADMIN_PASSWORD — segundo admin,
 *     opcional. Si SEED_SECOND_ADMIN_EMAIL está seteada, SEED_SECOND_ADMIN_PASSWORD
 *     es obligatoria (si falta, el script aborta SIN crear nada).
 *   SEED_SECOND_ADMIN_NAME / SEED_SECOND_ADMIN_LASTNAME  — opcionales,
 *     default "Admin" / "Equipo".
 *
 * Reglas (idempotencia y seguridad):
 * - Si un email ya existe, el script NUNCA toca su contraseña ni su rol.
 * - Si un email ya existe con un rol distinto de "admin", el script aborta
 *   TODO — no eleva privilegios automáticamente ("db:seed:admin" no es un
 *   endpoint de escalado). Para eso hace falta una acción explícita de otro
 *   admin desde el panel.
 * - Todas las altas de una misma corrida son una única transacción: o se
 *   crean todos los administradores que faltaban, o no se crea ninguno.
 * - bcrypt costo 12. Password mínima: 6 caracteres (misma regla que el
 *   flujo de reset de contraseña, ver auth.controller.js).
 *
 * ⚠️ Cambiar la contraseña por default en producción después del primer acceso.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { sequelize, Usuario } = require('../models');

const DEFAULT_EMAIL = 'admin@pasantias.com';
const DEFAULT_PASSWORD = 'Admin1234!';
const PASSWORD_MIN_LENGTH = 6; // misma regla que auth.controller.js (resetPassword)
const BCRYPT_COST = 12;

/**
 * Lee y valida las definiciones de administrador desde el entorno.
 * No toca la base de datos — solo parsea/valida. Devuelve TODOS los errores
 * encontrados (no se detiene en el primero) para que el operador los vea
 * todos juntos en un solo mensaje.
 * @returns {{ definiciones: Array, errores: string[] }}
 */
function leerDefiniciones() {
  const isProd = process.env.NODE_ENV === 'production';
  const definiciones = [];
  const errores = [];

  // ── Admin primario ──────────────────────────────────────────────────────
  if (isProd && (!process.env.SEED_ADMIN_EMAIL || !process.env.SEED_ADMIN_PASSWORD)) {
    errores.push('En producción, SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD son obligatorios.');
  } else {
    const email = (process.env.SEED_ADMIN_EMAIL || DEFAULT_EMAIL).trim().toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD || (isProd ? null : DEFAULT_PASSWORD);
    definiciones.push({
      etiqueta: 'primario', email, password,
      nombre: 'Admin', apellido: 'Sistema',
    });
  }

  // ── Segundo admin (opcional) ────────────────────────────────────────────
  const segundoEmail = process.env.SEED_SECOND_ADMIN_EMAIL;
  if (segundoEmail) {
    const segundoPassword = process.env.SEED_SECOND_ADMIN_PASSWORD;
    if (!segundoPassword) {
      errores.push('SEED_SECOND_ADMIN_EMAIL está seteada pero falta SEED_SECOND_ADMIN_PASSWORD.');
    } else {
      definiciones.push({
        etiqueta: 'segundo',
        email: segundoEmail.trim().toLowerCase(),
        password: segundoPassword,
        nombre: (process.env.SEED_SECOND_ADMIN_NAME || 'Admin').trim(),
        apellido: (process.env.SEED_SECOND_ADMIN_LASTNAME || 'Equipo').trim(),
      });
    }
  }

  // ── Validaciones que aplican a cualquier definición ya armada ───────────
  const emailsVistos = new Set();
  for (const def of definiciones) {
    if (!def.password || def.password.length < PASSWORD_MIN_LENGTH) {
      errores.push(`Password del admin "${def.etiqueta}" (${def.email}) inválida: mínimo ${PASSWORD_MIN_LENGTH} caracteres.`);
    }
    if (emailsVistos.has(def.email)) {
      errores.push(`SEED_ADMIN_EMAIL y SEED_SECOND_ADMIN_EMAIL no pueden ser el mismo email (${def.email}).`);
    }
    emailsVistos.add(def.email);
  }

  return { definiciones, errores };
}

/**
 * Ejecuta el alta de administrador(es). Transaccional: si algo falla a
 * mitad, no queda ningún admin creado a medias.
 * @returns {{ creados: string[], existentes: string[] }}
 */
async function ejecutarSeedAdmin() {
  const { definiciones, errores } = leerDefiniciones();
  if (errores.length > 0) {
    throw new Error(errores.join(' '));
  }

  const resultado = { creados: [], existentes: [] };

  await sequelize.transaction(async (t) => {
    // 1) Verificar precondiciones de TODOS antes de crear a ninguno.
    const planCreacion = [];
    for (const def of definiciones) {
      const existente = await Usuario.findOne({ where: { email: def.email }, transaction: t });
      if (existente) {
        if (existente.rol !== 'admin') {
          throw new Error(
            `Ya existe un usuario con email "${def.email}" pero con rol "${existente.rol}" (no "admin"). ` +
            'Abortado sin crear ni modificar nada — este script nunca eleva privilegios automáticamente.'
          );
        }
        resultado.existentes.push(def.email);
      } else {
        planCreacion.push(def);
      }
    }

    // 2) Crear los que faltaban — todos, en la misma transacción.
    for (const def of planCreacion) {
      const hash = await bcrypt.hash(def.password, BCRYPT_COST);
      await Usuario.create({
        nombre: def.nombre,
        apellido: def.apellido,
        email: def.email,
        password: hash,
        rol: 'admin',
        habilitado: true,
        activo: true,
      }, { transaction: t });
      resultado.creados.push(def.email);
    }
  });

  return resultado;
}

module.exports = { ejecutarSeedAdmin, leerDefiniciones, PASSWORD_MIN_LENGTH };

// ── CLI: node src/utils/seedAdmin.js ────────────────────────────────────────

if (require.main === module) {
  (async () => {
    try {
      // Fail-fast: validar env ANTES de conectar a la base (mismo criterio
      // que el script original — un env mal configurado no debe ni siquiera
      // intentar abrir una conexión).
      const { errores } = leerDefiniciones();
      if (errores.length > 0) {
        throw new Error(errores.join(' '));
      }

      await sequelize.authenticate();
      console.log('✅ Conectado a la base de datos.');

      const r = await ejecutarSeedAdmin();

      if (r.creados.length > 0) {
        console.log(`✅ Administrador(es) creado(s): ${r.creados.join(', ')}`);
        console.log('   🔑 Password: la definida en cada variable de entorno (nunca se imprime acá).');
      }
      if (r.existentes.length > 0) {
        console.log(`ℹ️  Ya existía(n), sin modificar: ${r.existentes.join(', ')}`);
        console.log('   Para resetear una contraseña: "Olvidé mi contraseña" en /login.');
      }
      if (r.creados.length === 0 && r.existentes.length === 0) {
        console.log('ℹ️  Nada para hacer.');
      }

      await sequelize.close();
      process.exit(0);
    } catch (err) {
      console.error('❌ Error en seedAdmin:', err.message);
      process.exit(1);
    }
  })();
}
