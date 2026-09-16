'use strict';

/**
 * seed-e2e.js — TEST-02.
 *
 * Prepara la base de datos de los tests E2E (Playwright): dropea, recrea,
 * migra y siembra un set FIJO y chico de datos, tomando los emails/títulos de
 * `e2e/fixtures.json` para que specs y seed coincidan.
 *
 * Guards (no se pueden saltear con flags):
 * - El nombre de la base SIEMPRE termina en `_e2e`. Si `DB_NAME` no lo hace,
 *   se deriva (`pasantias_db` → `pasantias_db_e2e`) — nunca opera sobre el
 *   nombre tal cual si no cumple el sufijo.
 * - Aborta si `DB_HOST` no es localhost/127.0.0.1/::1 (mismo criterio que
 *   resetDev.js) — el DROP/CREATE DATABASE nunca corre contra un host
 *   remoto (Neon u otro), sin importar qué nombre tenga la base.
 * Uso: DB_NAME=pasantias_db_e2e node scripts/seed-e2e.js   (o `npm run e2e:seed`)
 */

require('dotenv').config();
const path = require('path');
const bcrypt = require('bcryptjs');
const { execFileSync } = require('child_process');
const { Client } = require('pg');
const fx = require('../../e2e/fixtures.json');

const HOSTS_PERMITIDOS = new Set(['localhost', '127.0.0.1', '::1']);
const hostE2E = process.env.DB_HOST || 'localhost';
if (!HOSTS_PERMITIDOS.has(hostE2E)) {
  console.error(`❌ seed-e2e abortado: DB_HOST="${hostE2E}" no está en la allowlist local (${[...HOSTS_PERMITIDOS].join(', ')}). Este script nunca debe correr contra un host remoto (Neon u otro).`);
  process.exit(1);
}

// La base E2E SIEMPRE termina en `_e2e` (nunca dev ni prod). Si DB_NAME no lo
// hace, se deriva (`pasantias_db` → `pasantias_db_e2e`) y se re-exporta para
// que el subproceso de migración y el singleton de modelos la usen.
let DB = process.env.DB_NAME || 'pasantias_db';
if (!DB.endsWith('_e2e')) DB = `${DB}_e2e`;
process.env.DB_NAME = DB;

const conn = {
  host: hostE2E,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};

async function recrearBase() {
  const client = new Client({ ...conn, database: 'postgres' });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${DB}"`);
  } finally {
    await client.end();
  }
}

function migrar() {
  execFileSync('node', ['scripts/migrate.js', 'up'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, LOG_LEVEL: 'silent' },
    stdio: 'inherit',
  });
}

async function sembrar() {
  // require DESPUÉS de migrar: el singleton de sequelize toma DB_NAME=..._e2e.
  const {
    Usuario, Perfil, Empresa, EmpresaUsuario, Oferta, Postulacion, SolicitudEmpresa, sequelize,
  } = require('../src/models');

  const hash = await bcrypt.hash(fx.password, 4);
  const base = { password: hash, activo: true, habilitado: true };

  // ── Usuarios ──────────────────────────────────────────────────────────────
  const admin = await Usuario.create({ ...base, rol: 'admin', nombre: fx.admin.nombre, apellido: fx.admin.apellido, email: fx.admin.email });

  const alumno = await Usuario.create({ ...base, rol: 'alumno', nombre: fx.alumno.nombre, apellido: fx.alumno.apellido, email: fx.alumno.email });
  await Perfil.create({ usuarioId: alumno.id, carrera: 'Tecnicatura en Programación', cvPath: '/uploads/cv/e2e-alumno.pdf' });

  const alumno2 = await Usuario.create({ ...base, rol: 'alumno', nombre: fx.alumno2.nombre, apellido: fx.alumno2.apellido, email: fx.alumno2.email });
  await Perfil.create({ usuarioId: alumno2.id, carrera: 'Tecnicatura en Programación', cvPath: '/uploads/cv/e2e-alumno2.pdf' });

  const uAdminEmpresa = await Usuario.create({ ...base, rol: 'empresa', nombre: fx.adminEmpresa.nombre, apellido: fx.adminEmpresa.apellido, email: fx.adminEmpresa.email });
  const uReclutador   = await Usuario.create({ ...base, rol: 'empresa', nombre: fx.reclutador.nombre, apellido: fx.reclutador.apellido, email: fx.reclutador.email });

  // ── Empresa + equipo ──────────────────────────────────────────────────────
  const empresa = await Empresa.create({
    usuarioId: uAdminEmpresa.id,
    razonSocial: fx.empresa.razonSocial,
    cuit: fx.empresa.cuit,
    rubro: 'Software',
    ciudad: 'Avellaneda',
    estadoAprobacion: 'aprobada',
  });
  await EmpresaUsuario.create({ empresaId: empresa.id, usuarioId: uAdminEmpresa.id, rolInterno: 'admin_empresa', activo: true });
  await EmpresaUsuario.create({ empresaId: empresa.id, usuarioId: uReclutador.id,   rolInterno: 'reclutador',    activo: true });

  // ── Ofertas ───────────────────────────────────────────────────────────────
  const ofertaActiva = await Oferta.create({
    empresaId: empresa.id,
    titulo: fx.ofertaActiva.titulo,
    descripcion: 'Pasantía de desarrollo backend con Node.js y PostgreSQL. Datos generados para los tests E2E.',
    area: 'Programación', modalidad: 'hibrido', ciudad: 'Avellaneda',
    tipoPuesto: 'pasante', cantidadVacantes: 2,
    estado: 'activa', moderada: true,
  });
  await Oferta.create({
    empresaId: empresa.id,
    titulo: fx.ofertaPendiente.titulo,
    descripcion: 'Pasantía de análisis de datos, pendiente de moderación. Datos E2E.',
    area: 'Datos', modalidad: 'remoto',
    tipoPuesto: 'trainee', cantidadVacantes: 1,
    estado: 'activa', moderada: false,
  });

  // ── Postulación pre-sembrada (para "ver candidatos") ──────────────────────
  await Postulacion.create({ usuarioId: alumno2.id, ofertaId: ofertaActiva.id, estado: 'en_revision' });

  // ── Solicitud de empresa pendiente (para "gestionar solicitud") ───────────
  await SolicitudEmpresa.create({
    razonSocial: fx.solicitud.razonSocial,
    cuit: fx.solicitud.cuit,
    rubro: 'Consultoría',
    email: 'contacto@nuevoshorizontes.test',
    responsableNombre: 'Nico', responsableApellido: 'Horizonte',
    responsableEmail: 'nico@nuevoshorizontes.test',
    estado: 'pendiente',
  });

  await sequelize.close();

  console.log('\n✅ Seed E2E listo. Credenciales (password para todos: ' + fx.password + '):');
  for (const k of ['alumno', 'alumno2', 'adminEmpresa', 'reclutador', 'admin']) {
    console.log(`   ${k.padEnd(13)} ${fx[k].email}`);
  }
  console.log(`   empresa       ${fx.empresa.razonSocial} (aprobada)`);
  console.log(`   ofertas       "${fx.ofertaActiva.titulo}" (activa), "${fx.ofertaPendiente.titulo}" (pendiente)`);
  console.log(`   solicitud     "${fx.solicitud.razonSocial}" (pendiente)\n`);
}

(async () => {
  console.log(`▶ Recreando base E2E "${DB}"...`);
  await recrearBase();
  console.log('▶ Migrando...');
  migrar();
  console.log('▶ Sembrando...');
  await sembrar();
})().catch((err) => {
  console.error('❌ seed-e2e falló:', err.message);
  process.exit(1);
});
