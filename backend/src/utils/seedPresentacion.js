/**
 * seedPresentacion.js — Escenario DIRIGIDO de demo: la historia navegable de
 * la empresa "Delta Innovación IT", pensada para mostrarla a mano.
 *
 * Tres cuentas públicas de login (las únicas que muestra LoginPage):
 *
 *   empresa@demo.com     → Carolina Méndez, administradora de empresa (admin_empresa)
 *   reclutador@demo.com  → Diego Herrera, reclutador
 *   alumno@demo.com      → Martín Gómez, alumno con perfil completo
 *
 * Más el resto del elenco, en el namespace reservado `@demo.invalid` (no se
 * muestran en LoginPage ni en GET /api/demo/status):
 *
 *   lucia.ferrari@demo.invalid → Lucía Ferrari, SEGUNDA reclutadora activa
 *   candidatoNN@demo.invalid   → 10 candidatos sintéticos (alumnos/egresados)
 *
 * Equipo de Delta: 1 cuenta administradora (Carolina) + 2 reclutadores activos
 * (Diego y Lucía) + 1 solicitud de reclutador pendiente (Mateo Silva).
 *
 * RESPONSABLE DE UNA OFERTA: `Oferta.creadaPorUsuarioId` conserva su nombre
 * histórico pero hoy significa "reclutador RESPONSABLE ACTUAL de la oferta":
 * de él depende quién gestiona los candidatos, quién recibe las postulaciones
 * nuevas y con quién se habilita el chat. Por eso en este escenario:
 *   - toda oferta tiene como responsable a un RECLUTADOR activo (Diego o Lucía);
 *   - nunca al admin_empresa (gobierna y supervisa, no opera);
 *   - y hay EXACTAMENTE UNA oferta histórica sin responsable (NULL), a
 *     propósito, para mostrar "Sin responsable asignado" y la acción de
 *     asignar responsable. No hay backfill automático.
 * Ver RESPONSABLE más abajo.
 *
 * Los chats y las notificaciones respetan las mismas reglas que producción:
 * no hay conversación admin_empresa ↔ candidato, y el aviso de "nueva
 * postulación" le llega al reclutador responsable, nunca al admin_empresa.
 *
 * Deliberadamente NO crea ningún usuario con rol admin: el administrador real
 * del sistema se crea únicamente con `npm run db:seed:admin`, nunca usa la
 * contraseña demo, y no participa de este escenario (ni chats, ni
 * notificaciones, ni auditoría, ni como aprobador de la empresa). `Empresa.
 * aprobadaPorUsuarioId` queda en NULL (independiente del admin real).
 *
 * Tampoco crea archivos ficticios: no hay fila `Archivo` para CV ni logo (los
 * bytes no existirían en Render/R2 real). El logo de la empresa demo es una
 * URL https externa estable (ver LOGO_EMPRESA_URL); el alumno demo queda sin
 * CV cargado (el perfil lo indica explícitamente en la UI).
 *
 * Además siembra: 1 empresa aprobada (nivel de confianza estándar, explícito)
 * + logo por URL externa, 7 ofertas cubriendo ciclo de vida (activa/pausada/
 * cerrada) y moderación (aprobada/pendiente/rechazada, ejes independientes),
 * 16 postulaciones con historial de estados (4 del alumno demo + 12 del pool
 * de candidatos sintéticos, repartidas en todo el embudo), conversaciones de
 * chat, notificaciones, solicitudes de reclutador y de empresa, y registros
 * de auditoría (activity_logs).
 *
 * Autocontenido: crea todo su elenco, no depende de ningún otro seed.
 *
 * Es IDEMPOTENTE: cada corrida borra su propio escenario anterior (por email /
 * razón social) y lo vuelve a crear. No toca el resto de los datos demo.
 * Además, antes de sembrar, limpia de forma segura una eventual cuenta legacy
 * `sistema@demo.com` (rol admin) dejada por una versión anterior de este
 * seed — nunca toca ningún otro admin real (ver limpiarLegacySistemaDemo).
 *
 * Uso:
 *   npm run db:seed:presentacion      (desde backend/)
 *   node src/utils/seedPresentacion.js
 *
 * Además, el servidor lo invoca al arrancar vía `seedPresentacionSiFalta()`:
 * si el escenario no está cargado, lo siembra automáticamente. Ese chequeo
 * está activo por defecto solo en desarrollo (NODE_ENV=development) y se puede
 * forzar/desactivar con la variable SEED_PRESENTACION_ON_BOOT=true|false.
 *
 * Exporta: escenarioExiste(), ejecutarSeedPresentacion({ verbose }),
 *          limpiarEscenarioPresentacion() [limpia sin volver a sembrar — lo usa
 *          showcaseReset.js], seedPresentacionSiFalta(logger),
 *          EMP_ADMIN, RECLUTA, ALUMNO (única fuente de verdad de las 3 cuentas
 *          públicas — la consume también GET /api/demo/status) y el resto de
 *          los identificadores del escenario (los consume showcaseStatus.js).
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

const { config } = require('../config/env');
const { bloquearSiProd, exigirMigracionesAlDia } = require('./seedGuards');
const models = require('../models');
const {
  sequelize,
  Usuario,
  Perfil,
  Empresa,
  EmpresaUsuario,
  Oferta,
  Postulacion,
  PostulacionHistorialEstado,
  Notificacion,
  Mensaje,
  ActivityLog,
  SolicitudReclutador,
  SolicitudEmpresa,
  Archivo,
} = models;

// ── Constantes del escenario ────────────────────────────────────────────────

const PASSWORD = 'Demo1234!'; // solo para las cuentas de este escenario — el admin real nunca la usa

// Residuo de una versión anterior de este seed (creaba un 4º usuario, admin
// demo público). Se usa SOLO para limpiarlo si quedó de una corrida vieja —
// nunca se vuelve a crear (ver limpiarLegacySistemaDemo).
const LEGACY_ADMIN_EMAIL = 'sistema@demo.com';

const EMP_ADMIN = { email: 'empresa@demo.com',    nombre: 'Carolina', apellido: 'Méndez' };
const RECLUTA   = { email: 'reclutador@demo.com', nombre: 'Diego',    apellido: 'Herrera' };
const ALUMNO    = { email: 'alumno@demo.com',     nombre: 'Martín',   apellido: 'Gómez' };

// Segunda reclutadora ACTIVA de Delta. Namespace `@demo.invalid`: es parte del
// escenario pero NO una cuenta pública (no aparece en LoginPage ni en
// GET /api/demo/status). Permite mostrar un equipo con más de un reclutador y
// la asignación/reasignación real de ofertas Diego ↔ Lucía.
const RECLUTA_2 = { email: 'lucia.ferrari@demo.invalid', nombre: 'Lucía', apellido: 'Ferrari' };

// Solicitud de reclutador PENDIENTE (todavía no tiene cuenta de usuario).
const SOLICITUD_RECLUTADOR_PENDIENTE = { nombre: 'Mateo', apellido: 'Silva', email: 'mateo.silva@demo.invalid' };

const RAZON_SOCIAL = 'Delta Innovación IT';
const EMPRESA_CUIT = '30712345689';
const SOLICITUD_EMPRESA_EMAIL = 'registro@nubecode.demo';

// Pool de candidatos SINTÉTICOS (autocontenido, ver comentario de cabecera).
// Namespace `@demo.invalid` (dominio reservado por RFC 2606, nunca resuelve
// — mismo criterio que las IPs de auditoría en TEST-NET-3 más abajo) para
// que se distingan a simple vista de las 3 cuentas demo "de verdad". No se
// exponen en LoginPage ni en GET /api/demo/status (CUENTAS_DEMO en
// demo.controller.js es una lista fija de esas 3, no una query a la tabla
// usuarios). Comparten la misma password que las 3 cuentas demo — no es un
// secreto nuevo, es la MISMA `Demo1234!` ya documentada en README/DEPLOYMENT;
// no se crean para tener login individual, solo para poblar el pipeline de
// candidatos del reclutador con datos realistas y estables.
const CANDIDATOS_SINTETICOS = [
  { n: 1,  nombre: 'Sofía',      apellido: 'Ramírez',  rol: 'alumno',   carrera: 'Tecnicatura Superior en Programación',        ciudad: 'Avellaneda',      img: 40, area: 'Desarrollo Web',             habilidades: ['JavaScript', 'React', 'CSS', 'Git'] },
  { n: 2,  nombre: 'Nicolás',    apellido: 'Duarte',    rol: 'alumno',   carrera: 'Tecnicatura Superior en Análisis de Sistemas', ciudad: 'Quilmes',         img: 41, area: 'Programación',               habilidades: ['JavaScript', 'SQL', 'Testing'] },
  { n: 3,  nombre: 'Valentina',  apellido: 'Acosta',    rol: 'alumno',   carrera: 'Tecnicatura Superior en Redes',                ciudad: 'Lanús',           img: 42, area: 'Redes y Telecomunicaciones', habilidades: ['TCP/IP', 'Routing', 'Linux'] },
  { n: 4,  nombre: 'Tomás',      apellido: 'Benítez',   rol: 'alumno',   carrera: 'Tecnicatura Superior en Programación',        ciudad: 'Avellaneda',      img: 43, area: 'Programación',               habilidades: ['Node.js', 'Express', 'SQL', 'Git'] },
  { n: 5,  nombre: 'Camila',     apellido: 'Ortiz',      rol: 'alumno',   carrera: 'Tecnicatura Superior en Análisis de Sistemas', ciudad: 'Lomas de Zamora', img: 44, area: 'Programación',               habilidades: ['Node.js', 'PostgreSQL', 'Git'] },
  { n: 6,  nombre: 'Facundo',    apellido: 'Rojas',      rol: 'alumno',   carrera: 'Tecnicatura Superior en Programación',        ciudad: 'Lanús',           img: 45, area: 'Programación',               habilidades: ['Java', 'SQL', 'Node.js'] },
  { n: 7,  nombre: 'Julieta',    apellido: 'Vega',       rol: 'alumno',   carrera: 'Tecnicatura Superior en Redes',                ciudad: 'Banfield',        img: 46, area: 'Programación',               habilidades: ['Testing', 'Linux', 'Soporte'] },
  { n: 8,  nombre: 'Agustín',    apellido: 'Molina',     rol: 'egresado', carrera: 'Tecnicatura Superior en Análisis de Sistemas', ciudad: 'Quilmes',         img: 47, area: 'Programación',               habilidades: ['Testing', 'JavaScript', 'Playwright', 'Git'] },
  { n: 9,  nombre: 'Milagros',   apellido: 'Paz',        rol: 'alumno',   carrera: 'Tecnicatura Superior en Redes',                ciudad: 'Berazategui',     img: 48, area: 'Redes y Telecomunicaciones', habilidades: ['TCP/IP', 'Soporte', 'Routing'] },
  { n: 10, nombre: 'Bruno',      apellido: 'Suárez',     rol: 'egresado', carrera: 'Tecnicatura Superior en Programación',        ciudad: 'Wilde',           img: 49, area: 'Desarrollo Web',             habilidades: ['Figma', 'UX Research', 'Prototipado', 'CSS'] },
];
const candidatoEmail = (n) => `candidato${String(n).padStart(2, '0')}@demo.invalid`;
const CANDIDATO_EMAILS = CANDIDATOS_SINTETICOS.map((c) => candidatoEmail(c.n));

// URL https externa estable para el logo de la empresa demo — nunca un
// objeto R2 ni una fila Archivo (sección 5 del pedido: sin almacenar
// recursos demo en el storage real). ui-avatars.com genera un logo simple a
// partir del nombre, sin depender de un servicio de fotos de stock.
const LOGO_EMPRESA_URL = 'https://ui-avatars.com/api/?name=Delta+Innovacion&background=1e3a5f&color=fff&size=150&bold=true&format=png';

// Las 3 cuentas públicas (LoginPage / GET /api/demo/status).
const LOGIN_EMAILS = [EMP_ADMIN.email, RECLUTA.email, ALUMNO.email];

// TODO el elenco del escenario: alcance de limpiar() y de showcaseStatus.js.
// GET /api/demo/status usa EMP_ADMIN/RECLUTA/ALUMNO directamente (nunca esta
// lista), así que ni Lucía ni los candidatos aparecen ahí.
const OUR_EMAILS = [...LOGIN_EMAILS, RECLUTA_2.email, ...CANDIDATO_EMAILS];

// Log de progreso: ruidoso cuando se corre como script (`npm run db:seed:presentacion`),
// silencioso cuando lo invoca el arranque del servidor (ver seedPresentacionSiFalta).
let VERBOSE = true;
const say = (...args) => { if (VERBOSE) console.log(...args); };

// ── Helpers de fechas ───────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;
/** Fecha relativa a "ahora": daysAgo(3, 15) = hace 3 días a las 15:00 aprox. */
function daysAgo(days, hour = 10) {
  const d = new Date(Date.now() - days * DAY);
  d.setHours(hour, (days * 7) % 60, 0, 0);
  return d;
}

// ── Limpieza de la cuenta legacy "sistema@demo.com" ─────────────────────────

/**
 * Limpia de forma segura una cuenta `sistema@demo.com` (rol admin) dejada por
 * una versión anterior de este seed. El índice único `usuarios_email_lower_unique`
 * (migración 001) garantiza que ese email es global en toda la tabla
 * `usuarios` — el match por email exacto ya es inequívoco. Exigir además
 * `rol:'admin'` es una defensa adicional: si alguna vez existiera una fila
 * con ese email pero otro rol, esta función no la toca. Nunca borra ningún
 * otro admin — el filtro siempre es por ese email exacto.
 */
async function limpiarLegacySistemaDemo(transaction) {
  const legacy = await Usuario.findOne({
    where: { email: LEGACY_ADMIN_EMAIL, rol: 'admin' },
    paranoid: false, // por si una corrida vieja lo dejó soft-deleted
    transaction,
  });
  if (!legacy) return;

  say(`ℹ️  Encontrada cuenta legacy "${LEGACY_ADMIN_EMAIL}" (id=${legacy.id}) de una versión anterior del seed. Limpiando...`);

  await Mensaje.destroy({ where: { [Op.or]: [{ emisorId: legacy.id }, { receptorId: legacy.id }] }, transaction });
  await Notificacion.destroy({ where: { usuarioId: legacy.id }, transaction });
  await ActivityLog.destroy({ where: { usuarioId: legacy.id }, transaction });

  // Defensivo/explícito: Empresa.aprobadaPorUsuarioId ya es ON DELETE SET NULL
  // (migración 008) y Oferta.creadaPorUsuarioId también (migración 013), así
  // que el destroy de abajo ya lo haría solo — esto documenta la intención y
  // no depende de que esa regla de FK no cambie en el futuro.
  await Empresa.update({ aprobadaPorUsuarioId: null }, { where: { aprobadaPorUsuarioId: legacy.id }, transaction });
  await Oferta.update({ creadaPorUsuarioId: null }, { where: { creadaPorUsuarioId: legacy.id }, transaction });

  await Usuario.destroy({ where: { id: legacy.id }, transaction, force: true });
  say(`✅ Cuenta legacy "${LEGACY_ADMIN_EMAIL}" eliminada.`);
}

// ── Limpieza del escenario anterior ─────────────────────────────────────────

async function limpiar(transaction) {
  await limpiarLegacySistemaDemo(transaction);
  say('ℹ️  Limpiando escenario de presentación anterior (si existe)...');

  const users = await Usuario.findAll({
    where: { email: { [Op.in]: OUR_EMAILS } },
    attributes: ['id'],
    paranoid: false,
    transaction,
  });
  const userIds = users.map((u) => u.id);

  const empresas = await Empresa.findAll({
    where: { razonSocial: RAZON_SOCIAL },
    attributes: ['id'],
    paranoid: false,
    transaction,
  });
  const empresaIds = empresas.map((e) => e.id);

  const ofertas = empresaIds.length
    ? await Oferta.findAll({ where: { empresaId: { [Op.in]: empresaIds } }, attributes: ['id'], paranoid: false, transaction })
    : [];
  const ofertaIds = ofertas.map((o) => o.id);

  const orPost = [];
  if (userIds.length) orPost.push({ usuarioId: { [Op.in]: userIds } });
  if (ofertaIds.length) orPost.push({ ofertaId: { [Op.in]: ofertaIds } });

  if (orPost.length) {
    const posts = await Postulacion.findAll({ where: { [Op.or]: orPost }, attributes: ['id'], transaction });
    const postIds = posts.map((p) => p.id);
    if (postIds.length) {
      await PostulacionHistorialEstado.destroy({ where: { postulacionId: { [Op.in]: postIds } }, transaction });
      await Postulacion.destroy({ where: { id: { [Op.in]: postIds } }, transaction });
    }
  }

  if (userIds.length) {
    await Mensaje.destroy({
      where: { [Op.or]: [{ emisorId: { [Op.in]: userIds } }, { receptorId: { [Op.in]: userIds } }] },
      transaction,
    });
    await Notificacion.destroy({ where: { usuarioId: { [Op.in]: userIds } }, transaction });
    await ActivityLog.destroy({ where: { usuarioId: { [Op.in]: userIds } }, transaction });
  }

  if (empresaIds.length) {
    await SolicitudReclutador.destroy({ where: { empresaId: { [Op.in]: empresaIds } }, transaction });
    await Oferta.destroy({ where: { empresaId: { [Op.in]: empresaIds } }, transaction, force: true });
    await EmpresaUsuario.destroy({ where: { empresaId: { [Op.in]: empresaIds } }, transaction });
    await Empresa.destroy({ where: { id: { [Op.in]: empresaIds } }, transaction, force: true });
  }

  await SolicitudEmpresa.destroy({ where: { responsableEmail: SOLICITUD_EMPRESA_EMAIL }, transaction });

  if (userIds.length) {
    await Perfil.destroy({ where: { usuarioId: { [Op.in]: userIds } }, transaction });
    await EmpresaUsuario.destroy({ where: { usuarioId: { [Op.in]: userIds } }, transaction });
    await Archivo.destroy({ where: { usuarioPropietarioId: { [Op.in]: userIds } }, transaction, force: true });
    await Usuario.destroy({ where: { id: { [Op.in]: userIds } }, transaction, force: true });
  }
}

// ── Escenario ───────────────────────────────────────────────────────────────

async function sembrar(transaction) {
  const hash = await bcrypt.hash(PASSWORD, 12);
  const base = { password: hash, activo: true, habilitado: true };

  // 1. USUARIOS ─────────────────────────────────────────────────────────────
  say('🚀 Creando usuarios...');

  const empAdmin = await Usuario.create({
    ...base,
    rol: 'empresa',
    nombre: EMP_ADMIN.nombre,
    apellido: EMP_ADMIN.apellido,
    email: EMP_ADMIN.email,
    telefono: '11-4555-2200',
    ubicacion: 'Avellaneda, Buenos Aires',
    fotoPerfil: 'https://i.pravatar.cc/150?img=32',
    ultimoAcceso: daysAgo(1, 17),
    createdAt: daysAgo(60),
  }, { transaction });

  const reclutador = await Usuario.create({
    ...base,
    rol: 'empresa',
    nombre: RECLUTA.nombre,
    apellido: RECLUTA.apellido,
    email: RECLUTA.email,
    telefono: '11-4555-2201',
    ubicacion: 'Lanús, Buenos Aires',
    fotoPerfil: 'https://i.pravatar.cc/150?img=13',
    ultimoAcceso: daysAgo(0, 12),
    createdAt: daysAgo(50),
  }, { transaction });

  const reclutadora2 = await Usuario.create({
    ...base,
    rol: 'empresa',
    nombre: RECLUTA_2.nombre,
    apellido: RECLUTA_2.apellido,
    email: RECLUTA_2.email,
    telefono: '11-4555-2202',
    ubicacion: 'Quilmes, Buenos Aires',
    fotoPerfil: 'https://i.pravatar.cc/150?img=5',
    ultimoAcceso: daysAgo(1, 10),
    createdAt: daysAgo(38),
  }, { transaction });

  const alumno = await Usuario.create({
    ...base,
    rol: 'alumno',
    nombre: ALUMNO.nombre,
    apellido: ALUMNO.apellido,
    email: ALUMNO.email,
    telefono: '11-6123-4567',
    ubicacion: 'Quilmes, Buenos Aires',
    fotoPerfil: 'https://i.pravatar.cc/150?img=12',
    ultimoAcceso: daysAgo(0, 20),
    createdAt: daysAgo(70),
  }, { transaction });

  // 3. PERFIL DEL ALUMNO ────────────────────────────────────────────────────
  say('🚀 Creando perfil del alumno...');

  await Perfil.create({
    usuarioId: alumno.id,
    legajo: 'TSP-2021-0481',
    carrera: 'Tecnicatura Superior en Programación',
    anioEgreso: null,
    descripcion:
      'Estudiante avanzado de la Tecnicatura Superior en Programación (IT Beltrán). ' +
      'Me interesa el desarrollo web full stack, con foco en frontend (React) y APIs REST con Node.js. ' +
      'Busco una pasantía para aplicar lo aprendido y sumar experiencia en un equipo real.',
    habilidades: ['JavaScript', 'React', 'Node.js', 'Express', 'PostgreSQL', 'Git', 'HTML', 'CSS', 'Testing'],
    idiomas: ['Español nativo', 'Inglés B2 (lectura técnica fluida)'],
    certificaciones: ['Cisco NetAcad — Programming Essentials in Python', 'freeCodeCamp — Responsive Web Design'],
    linkedin: 'https://linkedin.com/in/martin-gomez-dev',
    github: 'https://github.com/martingomez-dev',
    portfolio: 'https://martingomez.dev',
    // Sin CV ficticio: cvPath/cvArchivoId quedan null. El perfil muestra un
    // aviso genérico de CV faltante (frontend/src/pages/alumno/PerfilPage.jsx),
    // igual que para cualquier usuario real sin CV cargado.
    fotoPerfil: 'https://i.pravatar.cc/150?img=12',
    areaInteres: 'Desarrollo Web',
    disponibilidad: 'inmediata',
    preferenciasLaborales:
      'Modalidad híbrida o remota. Interés en equipos que trabajen con metodologías ágiles, ' +
      'code review y buenas prácticas. Disponible 20-30 hs semanales.',
    salarioPretendido: 'A convenir (media jornada)',
    visibilidadPerfil: true,
    experienciaLaboral:
      '- Soporte técnico part-time en cooperativa barrial (2022-2023): atención a usuarios, ' +
      'mantenimiento de PCs y redes.\n' +
      '- Freelance: desarrollo de una landing page y un sitio institucional para un comercio local (2024).',
    proyectos:
      '- **Gestor de turnos** (Proyecto Final): SPA en React + API Node/Express + PostgreSQL. ' +
      'Autenticación JWT, panel de administración y notificaciones por email.\n' +
      '- **Clon de Trello** (práctica personal): drag & drop, persistencia en localStorage.\n' +
      '- Contribuciones menores a un repo open source de componentes UI.',
    createdAt: daysAgo(70),
  }, { transaction });

  // 4. EMPRESA + EQUIPO ────────────────────────────────────────────────────
  say('🚀 Creando empresa y equipo...');

  const empresa = await Empresa.create({
    razonSocial: RAZON_SOCIAL,
    cuit: EMPRESA_CUIT,
    descripcion:
      'Delta Innovación IT es una software factory de Avellaneda especializada en desarrollo web y ' +
      'mobile a medida, integraciones y modernización de sistemas. Trabajamos con clientes de fintech, ' +
      'salud y retail. Tenemos un programa de pasantías con mentoría y posibilidad de efectivización.',
    rubro: 'Software',
    sitioWeb: 'https://deltainnovacion.com.ar',
    telefono: '11-4555-2200',
    direccion: 'Av. Mitre 750, piso 3',
    ciudad: 'Avellaneda',
    // Logo por URL https externa (sección 5 del pedido): no crea objeto R2 ni
    // fila Archivo. `aprobadaPorUsuarioId` queda null: el escenario demo es
    // independiente del admin real (nunca expone quién aprobó realmente).
    logo: LOGO_EMPRESA_URL,
    estadoAprobacion: 'aprobada',
    // Explícito (no el default de la columna): Delta es una empresa ESTÁNDAR,
    // así sus ofertas y altas de reclutadores pasan por revisión institucional
    // y la demo puede mostrar ese flujo.
    nivelConfianza: 'estandar',
    aprobadaPorUsuarioId: null,
    aprobadaEn: daysAgo(59, 11),
    createdAt: daysAgo(60),
  }, { transaction });

  await EmpresaUsuario.create({
    empresaId: empresa.id,
    usuarioId: empAdmin.id,
    rolInterno: 'admin_empresa',
    activo: true,
    createdAt: daysAgo(60),
  }, { transaction });

  await EmpresaUsuario.create({
    empresaId: empresa.id,
    usuarioId: reclutador.id,
    rolInterno: 'reclutador',
    activo: true,
    createdAt: daysAgo(50),
  }, { transaction });

  await EmpresaUsuario.create({
    empresaId: empresa.id,
    usuarioId: reclutadora2.id,
    rolInterno: 'reclutador',
    activo: true,
    createdAt: daysAgo(38),
  }, { transaction });

  // 5. OFERTAS ─────────────────────────────────────────────────────────────
  say('🚀 Creando ofertas...');

  const carrerasIT = [
    'Tecnicatura Superior en Programación',
    'Tecnicatura Superior en Análisis de Sistemas',
    'Tecnicatura Superior en Redes',
  ];

  const ofertaDefs = [
    {
      key: 'frontend',
      titulo: 'Pasante en Desarrollo Frontend (React)',
      descripcion:
        'Sumate al equipo de producto para construir interfaces con React. Vas a trabajar junto a ' +
        'desarrolladores semi-senior en componentes reutilizables, consumo de APIs y mejoras de UX. ' +
        'Mentoría semanal y code review.',
      requisitos: 'Conocimientos de JavaScript, HTML y CSS. Nociones de React y Git. Ganas de aprender.',
      area: 'Desarrollo Web',
      modalidad: 'hibrido',
      modalidadExtendida: '3 días en oficina (Avellaneda) y 2 remoto',
      salario: 320000,
      habilidadesRequeridas: ['JavaScript', 'React', 'CSS', 'Git'],
      tipoPuesto: 'pasante',
      estado: 'activa',
      estadoModeracion: 'aprobada',
      vistas: 148,
      cantidadVacantes: 2,
      fechaPublicacion: daysAgo(25),
      fechaLimite: daysAgo(-20),
      createdAt: daysAgo(25),
    },
    {
      key: 'backend',
      titulo: 'Pasante en Desarrollo Backend (Node.js)',
      descripcion:
        'Desarrollo de APIs REST con Node.js, Express y PostgreSQL. Participación en el diseño de ' +
        'endpoints, tests de integración y documentación. Ambiente de aprendizaje con seniors.',
      requisitos: 'Lógica de programación, algo de Node.js y SQL. Se valora haber hecho un proyecto propio.',
      area: 'Programación',
      modalidad: 'remoto',
      salario: 330000,
      habilidadesRequeridas: ['Node.js', 'SQL', 'Express', 'Git'],
      tipoPuesto: 'pasante',
      estado: 'activa',
      estadoModeracion: 'aprobada',
      vistas: 96,
      cantidadVacantes: 1,
      fechaPublicacion: daysAgo(18),
      fechaLimite: daysAgo(-25),
      createdAt: daysAgo(18),
    },
    {
      key: 'qa',
      titulo: 'Trainee en QA y Automatización de Pruebas',
      descripcion:
        'Ejecución de casos de prueba manuales y primeros pasos en automatización con Playwright. ' +
        'Reporte de bugs, trabajo con el equipo de desarrollo y participación en las dailies.',
      requisitos: 'Atención al detalle, pensamiento analítico. Nociones de programación. Inglés lectura.',
      area: 'Programación',
      modalidad: 'hibrido',
      modalidadExtendida: '2 días en oficina y 3 remoto',
      salario: 300000,
      habilidadesRequeridas: ['Testing', 'JavaScript', 'Git'],
      tipoPuesto: 'trainee',
      estado: 'activa',
      estadoModeracion: 'aprobada',
      vistas: 71,
      cantidadVacantes: 1,
      fechaPublicacion: daysAgo(22),
      fechaLimite: daysAgo(-5),
      createdAt: daysAgo(22),
    },
    {
      key: 'soporte',
      titulo: 'Pasante en Soporte y Administración de Redes',
      descripcion:
        'Apoyo al área de infraestructura: soporte a usuarios internos, monitoreo de red y ' +
        'documentación. Ideal para estudiantes de la Tecnicatura en Redes.',
      requisitos: 'TCP/IP, nociones de routing/switching. Predisposición para la atención a usuarios.',
      area: 'Redes y Telecomunicaciones',
      modalidad: 'presencial',
      salario: 290000,
      habilidadesRequeridas: ['TCP/IP', 'Routing', 'Soporte'],
      tipoPuesto: 'pasante',
      estado: 'pausada',
      estadoModeracion: 'aprobada',
      vistas: 54,
      cantidadVacantes: 1,
      fechaPublicacion: daysAgo(35),
      fechaLimite: daysAgo(-10),
      createdAt: daysAgo(35),
    },
    {
      key: 'datos',
      titulo: 'Pasante en Análisis de Datos',
      descripcion:
        'Limpieza y análisis de datos con Python y SQL. Construcción de dashboards y reportes para ' +
        'el equipo de negocio. Acompañamiento de un analista senior.',
      requisitos: 'Python básico, SQL, Excel. Interés en visualización de datos.',
      area: 'Programación',
      modalidad: 'remoto',
      salario: 315000,
      habilidadesRequeridas: ['Python', 'SQL', 'Excel'],
      tipoPuesto: 'pasante',
      estado: 'activa',
      estadoModeracion: 'pendiente',
      vistas: 8,
      cantidadVacantes: 1,
      fechaPublicacion: daysAgo(2),
      fechaLimite: daysAgo(-40),
      createdAt: daysAgo(2),
    },
    {
      key: 'ux',
      titulo: 'Pasante en Diseño UX/UI',
      descripcion:
        'Diseño de wireframes y prototipos en Figma, investigación con usuarios y handoff a ' +
        'desarrollo. Trabajo junto al equipo de producto.',
      requisitos: 'Manejo de Figma, nociones de diseño de interacción y accesibilidad.',
      area: 'Diseño Industrial',
      modalidad: 'hibrido',
      salario: 305000,
      habilidadesRequeridas: ['Figma', 'UX Research', 'Prototipado'],
      tipoPuesto: 'pasante',
      estado: 'cerrada',
      estadoModeracion: 'aprobada',
      vistas: 203,
      cantidadVacantes: 1,
      // Posterior a la empresa (hace 60 días) y a la llegada de Diego (hace 50).
      fechaPublicacion: daysAgo(43),
      fechaLimite: daysAgo(20),
      createdAt: daysAgo(43),
    },
    {
      key: 'ciber',
      titulo: 'Pasante en Ciberseguridad',
      descripcion:
        'Apoyo al área de seguridad: análisis de logs, hardening básico y seguimiento de incidentes.',
      requisitos: 'Linux, OWASP Top 10, ganas de aprender pentesting.',
      area: 'Ciberseguridad',
      modalidad: 'presencial',
      salario: 340000,
      habilidadesRequeridas: ['Linux', 'OWASP', 'Análisis de logs'],
      tipoPuesto: 'pasante',
      estado: 'activa', // el ciclo de vida no se toca al rechazar
      estadoModeracion: 'rechazada',
      vistas: 3,
      cantidadVacantes: 1,
      // La más vieja del escenario: es el caso HISTÓRICO sin responsable.
      fechaPublicacion: daysAgo(55),
      fechaLimite: daysAgo(25),
      createdAt: daysAgo(55),
    },
  ];

  // RESPONSABLE ACTUAL de cada oferta (`creadaPorUsuarioId`, ver cabecera).
  // Siempre un reclutador activo, nunca el admin_empresa. 'ciber' queda en
  // null A PROPÓSITO: es el único caso histórico "Sin responsable asignado",
  // para mostrar la acción de asignar responsable del administrador de empresa.
  // Cada responsable ya era parte del equipo cuando se publicó su oferta
  // (Diego desde hace 50 días, Lucía desde hace 38).
  const RESPONSABLE = {
    frontend: reclutador,   // activa   · aprobada
    backend: reclutador,    // activa   · aprobada
    datos: reclutador,      // activa   · pendiente de revisión
    ux: reclutador,         // cerrada  · aprobada
    qa: reclutadora2,       // activa   · aprobada
    soporte: reclutadora2,  // pausada  · aprobada
    ciber: null,            // activa   · rechazada — histórica, sin responsable
  };

  const ofertas = {};
  for (const def of ofertaDefs) {
    const { key, ...data } = def;
    ofertas[key] = await Oferta.create({
      empresaId: empresa.id,
      remuneracion: 'A convenir',
      beneficios: 'Mentoría, capacitaciones, certificación de la pasantía y posibilidad de efectivización.',
      requiereExperiencia: false,
      nivelExperiencia: 'sin_experiencia',
      carrerasDestinatarias: carrerasIT,
      creadaPorUsuarioId: RESPONSABLE[key]?.id ?? null,
      ...data,
    }, { transaction });
  }
  const responsableDe = (oferta) => Object.keys(ofertas)
    .filter((key) => ofertas[key].id === oferta.id)
    .map((key) => RESPONSABLE[key])[0] ?? null;

  // 6. POSTULACIONES ───────────────────────────────────────────────────────
  say('🚀 Creando postulaciones + historial de estados...');

  // Helper: crea la postulación y su cadena de historial en una sola pasada.
  async function postular({ usuario, oferta, estado, cartaPresentacion, notasEmpresa, cadena, diasBase, cvId }) {
    const fecha = daysAgo(diasBase, 11);
    const post = await Postulacion.create({
      usuarioId: usuario.id,
      ofertaId: oferta.id,
      cartaPresentacion,
      estado,
      fechaPostulacion: fecha,
      notasEmpresa: notasEmpresa || null,
      cvArchivoId: cvId || null,
      createdAt: fecha,
      updatedAt: daysAgo(Math.max(0, diasBase - (cadena.length - 1) * 2), 16),
    }, { transaction });

    // cadena: ['en_revision', 'preseleccionado', ...] — pasos consecutivos.
    let anterior = null;
    for (let i = 0; i < cadena.length; i++) {
      const nuevo = cadena[i];
      await PostulacionHistorialEstado.create({
        postulacionId: post.id,
        estadoAnterior: anterior,
        estadoNuevo: nuevo,
        cambiadoPorUsuarioId: i === 0 ? usuario.id : responsableDe(oferta).id,
        motivo: i === 0
          ? 'Postulación enviada por el alumno.'
          : `Cambio de estado a "${nuevo}" desde el panel de la empresa.`,
        notaInterna: i === 0 ? null : 'Registrado durante la demo.',
        createdAt: daysAgo(Math.max(0, diasBase - i * 2), 12 + i),
      }, { transaction });
      anterior = nuevo;
    }
    return post;
  }

  // 6a. Postulaciones del ALUMNO DEMO (con historial completo)
  await postular({
    usuario: alumno,
    oferta: ofertas.frontend,
    estado: 'entrevista',
    diasBase: 12,
    cartaPresentacion:
      'Hola, me interesa mucho esta pasantía. Vengo trabajando con React en mis proyectos ' +
      '(gestor de turnos, clon de Trello) y me gustaría crecer en un equipo con code review y mentoría. ' +
      'Tengo disponibilidad inmediata para modalidad híbrida.',
    notasEmpresa: 'Buen dominio de React para el nivel. Proyecto final sólido. Avanza a entrevista técnica.',
    cadena: ['en_revision', 'preseleccionado', 'entrevista'],
  });

  await postular({
    usuario: alumno,
    oferta: ofertas.backend,
    estado: 'en_revision',
    diasBase: 5,
    cartaPresentacion:
      'Me postulo a la pasantía de backend. Hice una API REST con Node, Express y PostgreSQL para mi ' +
      'proyecto final, con autenticación JWT y tests. Quiero profundizar en buenas prácticas de backend.',
    cadena: ['en_revision'],
  });

  await postular({
    usuario: alumno,
    oferta: ofertas.qa,
    estado: 'contratado',
    diasBase: 20,
    cartaPresentacion:
      'Me interesa iniciarme en QA. Soy detallista y ya programo, así que la parte de automatización ' +
      'con Playwright me entusiasma. Disponibilidad inmediata.',
    notasEmpresa: 'Entrevista muy buena. Se incorpora al equipo de QA. Inicio coordinado con RRHH.',
    cadena: ['en_revision', 'preseleccionado', 'entrevista', 'contratado'],
  });

  await postular({
    usuario: alumno,
    oferta: ofertas.ux,
    estado: 'rechazado',
    diasBase: 40, // posterior a la publicación de la oferta (hace 43 días)
    cartaPresentacion:
      'Aunque mi foco es desarrollo, tengo interés en UX y manejo básico de Figma. Me gustaría ' +
      'aprender del proceso de diseño de producto.',
    notasEmpresa: 'Perfil más orientado a desarrollo que a diseño. Se sugiere postular a las vacantes técnicas.',
    cadena: ['en_revision', 'rechazado'],
  });

  // 6b. Pool de candidatos SINTÉTICOS (creados acá mismo, ver
  //     CANDIDATOS_SINTETICOS) para que el reclutador tenga a quién
  //     gestionar en las ofertas activas — autocontenido, no depende de que
  //     otro seed haya corrido antes.
  say('🚀 Creando candidatos sintéticos del pool...');
  const poolAlumnos = [];
  for (const c of CANDIDATOS_SINTETICOS) {
    const candidato = await Usuario.create({
      ...base,
      rol: c.rol,
      nombre: c.nombre,
      apellido: c.apellido,
      email: candidatoEmail(c.n),
      ubicacion: `${c.ciudad}, Buenos Aires`,
      fotoPerfil: `https://i.pravatar.cc/150?img=${c.img}`,
      ultimoAcceso: daysAgo(c.n, 9 + (c.n % 8)),
      createdAt: daysAgo(60 - c.n),
    }, { transaction });
    await Perfil.create({
      usuarioId: candidato.id,
      carrera: c.carrera,
      anioEgreso: c.rol === 'egresado' ? new Date().getFullYear() - 1 : null,
      descripcion:
        `${c.rol === 'egresado' ? 'Egresado/a' : 'Estudiante'} de la ${c.carrera} (IT Beltrán), de ${c.ciudad}. ` +
        `Busco mi primera experiencia laboral en ${c.area}.`,
      areaInteres: c.area,
      disponibilidad: 'inmediata',
      habilidades: c.habilidades,
      idiomas: ['Español nativo', 'Inglés técnico'],
      // Sin CV ficticio (cvPath/cvArchivoId null): no se crean archivos que no existen.
      visibilidadPerfil: true,
      createdAt: daysAgo(50 - c.n),
    }, { transaction });
    poolAlumnos.push(candidato);
  }

  // 12 postulaciones del pool (algunos candidatos aplican a dos ofertas). Con
  // las 4 del alumno demo son 16, repartidas en todo el embudo:
  //   en revisión 5 · preseleccionado 3 · entrevista 3 · contratado 2 · no seleccionado 3
  //
  // `c` es el número del candidato. `diasBase` es explícito por entrada: la
  // postulación tiene que ser POSTERIOR a la publicación de su oferta
  // (frontend 25, backend 18, qa 22, soporte 35, ux 43 días atrás) y la cadena
  // de estados avanza de a 2 días sin pasarse de hoy. Ninguna postulación va a
  // 'datos' (pendiente de moderación) ni a 'ciber' (rechazada): esas ofertas
  // no son visibles para los alumnos.
  const CADENA = {
    en_revision: ['en_revision'],
    preseleccionado: ['en_revision', 'preseleccionado'],
    entrevista: ['en_revision', 'preseleccionado', 'entrevista'],
    contratado: ['en_revision', 'preseleccionado', 'entrevista', 'contratado'],
    rechazado: ['en_revision', 'rechazado'],
  };
  const poolPlan = [
    { c: 1,  oferta: 'frontend', estado: 'preseleccionado', diasBase: 14 },
    { c: 2,  oferta: 'frontend', estado: 'en_revision',     diasBase: 6 },
    { c: 3,  oferta: 'frontend', estado: 'rechazado',       diasBase: 16 },
    { c: 4,  oferta: 'backend',  estado: 'entrevista',      diasBase: 12 },
    { c: 5,  oferta: 'backend',  estado: 'en_revision',     diasBase: 4 },
    { c: 6,  oferta: 'backend',  estado: 'preseleccionado', diasBase: 10 },
    { c: 7,  oferta: 'qa',       estado: 'rechazado',       diasBase: 15 },
    { c: 8,  oferta: 'qa',       estado: 'entrevista',      diasBase: 14 },
    { c: 2,  oferta: 'qa',       estado: 'en_revision',     diasBase: 9 },
    { c: 9,  oferta: 'soporte',  estado: 'preseleccionado', diasBase: 28 },
    { c: 3,  oferta: 'soporte',  estado: 'en_revision',     diasBase: 30 },
    { c: 10, oferta: 'ux',       estado: 'contratado',      diasBase: 36 },
  ].map((p) => ({ ...p, cadena: CADENA[p.estado] }));

  for (const plan of poolPlan) {
    const cand = poolAlumnos[plan.c - 1];
    await postular({
      usuario: cand,
      oferta: ofertas[plan.oferta],
      estado: plan.estado,
      diasBase: plan.diasBase,
      cartaPresentacion:
        `Hola, soy ${cand.nombre} ${cand.apellido}, estudiante de IT Beltrán. Me postulo a esta ` +
        'búsqueda porque se alinea con lo que estoy estudiando y busco mi primera experiencia laboral.',
      notasEmpresa: plan.estado === 'rechazado'
        ? 'No avanza en esta instancia. Perfil a re-contactar en futuras búsquedas.'
        : plan.estado === 'contratado'
          ? 'Seleccionado/a. Cubre la vacante.'
          : 'En evaluación por el equipo.',
      cadena: plan.cadena,
    });
  }

  // 7. SOLICITUDES (reclutador + empresa) ──────────────────────────────────
  say('🚀 Creando solicitudes pendientes...');

  // Historial del equipo: las altas de Diego y Lucía (aprobadas) y una
  // solicitud PENDIENTE de un tercero (Mateo), que todavía no tiene cuenta.
  await SolicitudReclutador.create({
    empresaId: empresa.id,
    nombre: RECLUTA.nombre,
    apellido: RECLUTA.apellido,
    email: RECLUTA.email,
    estado: 'aprobado',
    createdAt: daysAgo(51, 10),
  }, { transaction });

  await SolicitudReclutador.create({
    empresaId: empresa.id,
    nombre: RECLUTA_2.nombre,
    apellido: RECLUTA_2.apellido,
    email: RECLUTA_2.email,
    estado: 'aprobado',
    createdAt: daysAgo(39, 10),
  }, { transaction });

  await SolicitudReclutador.create({
    empresaId: empresa.id,
    nombre: SOLICITUD_RECLUTADOR_PENDIENTE.nombre,
    apellido: SOLICITUD_RECLUTADOR_PENDIENTE.apellido,
    email: SOLICITUD_RECLUTADOR_PENDIENTE.email,
    estado: 'pendiente',
    createdAt: daysAgo(3, 15),
  }, { transaction });

  await SolicitudEmpresa.create({
    razonSocial: 'NubeCode SRL',
    cuit: '30-71555222-7',
    rubro: 'Software',
    direccion: 'Belgrano 1240',
    ciudad: 'Lomas de Zamora',
    email: 'contacto@nubecode.demo',
    sitioWeb: 'https://nubecode.demo',
    telefono: '11-4222-9000',
    responsableNombre: 'Andrés',
    responsableApellido: 'Quiroga',
    responsableEmail: SOLICITUD_EMPRESA_EMAIL,
    responsableTelefono: '11-4222-9001',
    responsableCargo: 'Gerente de RRHH',
    carrerasInteres: carrerasIT,
    descripcion: 'Consultora de desarrollo cloud y DevOps. Buscamos incorporar pasantes de sistemas.',
    puestos: 'Pasantes de desarrollo backend, DevOps junior y QA.',
    estado: 'pendiente',
    reclutadores: [
      { nombre: 'Paula', apellido: 'Ibarra', email: 'paula.ibarra@nubecode.demo' },
    ],
    createdAt: daysAgo(1, 16),
  }, { transaction });

  // 8. MENSAJES / CHAT ─────────────────────────────────────────────────────
  say('🚀 Creando conversaciones de chat...');

  // Mismas reglas que producción (chatPermission.service.js): el equipo de una
  // empresa chatea entre sí; con un candidato solo chatea el RECLUTADOR
  // RESPONSABLE de la oferta, y recién cuando la postulación avanzó
  // (preseleccionado / entrevista / contratado). Nunca admin_empresa ↔ candidato.
  let totalMensajes = 0;
  let totalConversaciones = 0;
  async function conversacion(pares) {
    // pares: [{ de, a, texto, dias, hora, leido }]
    totalConversaciones += 1;
    totalMensajes += pares.length;
    for (const p of pares) {
      await Mensaje.create({
        emisorId: p.de.id,
        receptorId: p.a.id,
        mensaje: p.texto,
        leido: p.leido !== false,
        createdAt: daysAgo(p.dias, p.hora),
        updatedAt: daysAgo(p.dias, p.hora),
      }, { transaction });
    }
  }

  // 8a. Reclutador ↔ Alumno demo — coordinación de entrevista (oferta Frontend)
  await conversacion([
    { de: reclutador, a: alumno, texto: 'Hola Martín, soy Diego de Delta Innovación IT. Revisamos tu postulación al puesto de Frontend y nos gustó tu proyecto final. ¿Tenés disponibilidad para una entrevista técnica esta semana?', dias: 9, hora: 10 },
    { de: alumno, a: reclutador, texto: '¡Hola Diego! Muchas gracias. Sí, tengo disponibilidad. Me vendría bien miércoles o jueves a la tarde.', dias: 9, hora: 12 },
    { de: reclutador, a: alumno, texto: 'Perfecto. Agendemos el jueves a las 16:00. Es por videollamada, te llega el link por mail. Va a durar unos 45 minutos: repaso de tu experiencia y un ejercicio corto de React.', dias: 8, hora: 9 },
    { de: alumno, a: reclutador, texto: 'Genial, confirmado para el jueves 16:00. ¿Necesito preparar algo en particular?', dias: 8, hora: 13 },
    { de: reclutador, a: alumno, texto: 'Solo tener el entorno de desarrollo listo (Node + un editor). El ejercicio es sobre componentes y estado. Cualquier duda escribime.', dias: 8, hora: 14 },
    { de: alumno, a: reclutador, texto: '¡Perfecto! Nos vemos el jueves. Gracias Diego.', dias: 7, hora: 18, leido: false },
  ]);

  // 8b. Reclutadora (Lucía) ↔ Alumno demo — onboarding tras ser contratado en
  //     QA. La oferta de QA es de Lucía: es ELLA quien escribe, no la cuenta
  //     administradora (admin_empresa no chatea con candidatos).
  await conversacion([
    { de: reclutadora2, a: alumno, texto: 'Hola Martín, soy Lucía, reclutadora de Delta Innovación IT. ¡Felicitaciones! Quedaste seleccionado para la pasantía de QA. Te escribo para coordinar el inicio.', dias: 13, hora: 11 },
    { de: alumno, a: reclutadora2, texto: '¡Hola Lucía! Muchísimas gracias, qué buena noticia. Estoy disponible para empezar cuando me indiquen.', dias: 13, hora: 15 },
    { de: reclutadora2, a: alumno, texto: 'Genial. El lunes que viene a las 10:00 en la oficina de Avellaneda para la inducción. Traé tu DNI y el certificado de alumno regular. Te enviamos el convenio de pasantía por mail para revisar.', dias: 12, hora: 9 },
    { de: alumno, a: reclutadora2, texto: 'Perfecto, el lunes 10:00 estoy ahí con la documentación. Ya recibí el convenio, lo reviso y consulto si tengo dudas.', dias: 12, hora: 16, leido: false },
  ]);

  // 8c. Admin empresa ↔ Reclutador — coordinación interna del equipo
  await conversacion([
    { de: empAdmin, a: reclutador, texto: 'Diego, ¿cómo venimos con las postulaciones de Frontend? Necesito el resumen para la reunión de mañana.', dias: 6, hora: 10 },
    { de: reclutador, a: empAdmin, texto: 'Tenemos 4 postulaciones. Martín Gómez avanzó a entrevista técnica (jueves), hay una preseleccionada más, una en revisión y una que descartamos por perfil.', dias: 6, hora: 11 },
    { de: empAdmin, a: reclutador, texto: 'Bien. Acordate de cargar las notas de cada candidato en el sistema así queda el historial. ¿La oferta de Datos ya está publicada?', dias: 6, hora: 11 },
    { de: reclutador, a: empAdmin, texto: 'Sí, la creé ayer pero todavía figura pendiente de moderación del admin del sistema. En cuanto la aprueben empieza a recibir postulaciones.', dias: 5, hora: 17 },
    { de: empAdmin, a: reclutador, texto: 'Perfecto. Pedí además el alta de Mateo Silva como tercer reclutador; está pendiente de aprobación del instituto. Y quedó una oferta vieja de Ciberseguridad sin responsable: si la retomamos te la asigno.', dias: 3, hora: 18, leido: false },
  ]);

  // 8d. Reclutador (Diego) ↔ candidata preseleccionada en Frontend (su oferta)
  const candFrontend = poolAlumnos[0]; // Sofía Ramírez
  await conversacion([
    { de: reclutador, a: candFrontend, texto: `Hola ${candFrontend.nombre}, gracias por postularte a Frontend. Quedaste preseleccionada, en los próximos días te contactamos para coordinar una entrevista.`, dias: 11, hora: 11 },
    { de: candFrontend, a: reclutador, texto: '¡Hola! Muchas gracias por el aviso. Quedo atenta.', dias: 11, hora: 14, leido: false },
  ]);

  // 8e. Reclutadora (Lucía) ↔ candidato en entrevista en QA (su oferta)
  const candQa = poolAlumnos[7]; // Agustín Molina
  await conversacion([
    { de: reclutadora2, a: candQa, texto: `Hola ${candQa.nombre}, soy Lucía de Delta Innovación IT. Avanzaste a la etapa de entrevista para QA. ¿Podés el martes a las 11:00 por videollamada?`, dias: 9, hora: 10 },
    { de: candQa, a: reclutadora2, texto: 'Hola Lucía, sí, el martes 11:00 me queda perfecto. ¡Gracias!', dias: 9, hora: 13, leido: false },
  ]);

  // 9. NOTIFICACIONES ──────────────────────────────────────────────────────
  say('🚀 Creando notificaciones...');

  let totalNotificaciones = 0;
  async function notif(data) {
    totalNotificaciones += 1;
    await Notificacion.create({
      leida: false,
      prioridad: 'normal',
      tipoVisual: 'info',
      ...data,
      createdAt: data.createdAt || daysAgo(1),
    }, { transaction });
  }

  // 9a. Alumno demo
  await notif({ usuarioId: alumno.id, tipo: 'estado', titulo: 'Avanzaste a Entrevista', mensaje: 'Tu postulación a "Pasante en Desarrollo Frontend (React)" en Delta Innovación IT pasó a estado Entrevista.', tipoVisual: 'success', prioridad: 'alta', accionURL: '/mis-postulaciones', leida: true, createdAt: daysAgo(8, 13) });
  await notif({ usuarioId: alumno.id, tipo: 'chat', titulo: 'Nuevo mensaje de Diego Herrera', mensaje: 'Tenés un mensaje nuevo sobre la coordinación de tu entrevista.', accionURL: '/chat', createdAt: daysAgo(8, 14) });
  await notif({ usuarioId: alumno.id, tipo: 'estado', titulo: '¡Fuiste contratado!', mensaje: 'Felicitaciones: fuiste seleccionado para la pasantía "Trainee en QA y Automatización de Pruebas".', tipoVisual: 'success', prioridad: 'urgente', accionURL: '/mis-postulaciones', createdAt: daysAgo(14, 10) });
  await notif({ usuarioId: alumno.id, tipo: 'chat', titulo: 'Nuevo mensaje de Lucía Ferrari', mensaje: 'Te escribió para coordinar el inicio de la pasantía de QA.', accionURL: '/chat', leida: true, createdAt: daysAgo(13, 11) });
  await notif({ usuarioId: alumno.id, tipo: 'estado', titulo: 'Actualización en tu postulación', mensaje: 'Tu postulación a "Pasante en Diseño UX/UI" fue actualizada a estado Rechazado.', tipoVisual: 'warning', accionURL: '/mis-postulaciones', leida: true, createdAt: daysAgo(38, 12) });
  await notif({ usuarioId: alumno.id, tipo: 'oferta', titulo: 'Nueva oferta compatible con tu perfil', mensaje: 'Se publicó "Pasante en Desarrollo Backend (Node.js)", compatible con tu área de interés (Desarrollo Web).', accionURL: '/ofertas', createdAt: daysAgo(18, 8) });
  await notif({ usuarioId: alumno.id, tipo: 'sistema', titulo: 'Completá tu perfil', mensaje: 'Los perfiles completos reciben hasta 3× más respuestas de las empresas. Revisá tu CV y tus habilidades.', prioridad: 'baja', accionURL: '/perfil', createdAt: daysAgo(30, 10) });

  // 9b. Administradora de empresa — GOBIERNO, no operación: moderación de
  //     ofertas, altas del equipo y mensajes internos. Nunca "Nueva postulación
  //     recibida": ese aviso es del reclutador responsable.
  await notif({ usuarioId: empAdmin.id, tipo: 'oferta', titulo: 'Una de tus ofertas fue rechazada', mensaje: '"Pasante en Ciberseguridad" fue rechazada en la moderación. Motivo: el detalle de tareas es insuficiente. Podés volver a cargarla con más información.', tipoVisual: 'error', prioridad: 'alta', accionURL: '/empresa/ofertas', leida: true, createdAt: daysAgo(54, 16) });
  await notif({ usuarioId: empAdmin.id, tipo: 'sistema', titulo: 'Reclutadora aprobada', mensaje: 'El instituto aprobó el alta de Lucía Ferrari. Ya forma parte del equipo de Delta Innovación IT.', tipoVisual: 'success', accionURL: '/empresa/equipo', leida: true, createdAt: daysAgo(38, 12) });
  await notif({ usuarioId: empAdmin.id, tipo: 'oferta', titulo: 'Tu oferta fue aprobada', mensaje: '"Pasante en Desarrollo Frontend (React)" superó la moderación y ya es visible para los alumnos.', tipoVisual: 'success', accionURL: '/empresa/ofertas', leida: true, createdAt: daysAgo(24, 13) });
  await notif({ usuarioId: empAdmin.id, tipo: 'oferta', titulo: 'Tu oferta fue aprobada', mensaje: '"Pasante en Desarrollo Backend (Node.js)" superó la moderación y ya es visible para los alumnos.', tipoVisual: 'success', accionURL: '/empresa/ofertas', leida: true, createdAt: daysAgo(17, 13) });
  await notif({ usuarioId: empAdmin.id, tipo: 'chat', titulo: 'Nuevo mensaje de Diego Herrera', mensaje: 'Te respondió sobre el estado de las búsquedas activas.', accionURL: '/chat', createdAt: daysAgo(5, 17) });
  await notif({ usuarioId: empAdmin.id, tipo: 'sistema', titulo: 'Solicitud de reclutador enviada', mensaje: 'Tu solicitud de alta para Mateo Silva está pendiente de aprobación del instituto. Podés seguirla en la sección Equipo.', tipoVisual: 'warning', accionURL: '/empresa/equipo', createdAt: daysAgo(3, 15) });

  // 9c. Reclutador (Diego) — operación de SUS ofertas
  await notif({ usuarioId: reclutador.id, tipo: 'sistema', titulo: 'Te sumaron al equipo', mensaje: 'Ahora sos parte del equipo de Delta Innovación IT como reclutador. Ya podés crear ofertas y gestionar candidatos.', tipoVisual: 'success', accionURL: '/empresa', leida: true, createdAt: daysAgo(50, 10) });
  await notif({ usuarioId: reclutador.id, tipo: 'oferta', titulo: 'Tu oferta fue aprobada', mensaje: '"Pasante en Desarrollo Backend (Node.js)" superó la moderación y ya es visible para los alumnos.', tipoVisual: 'success', accionURL: '/empresa', leida: true, createdAt: daysAgo(17, 13) });
  await notif({ usuarioId: reclutador.id, tipo: 'postulacion', titulo: 'Nueva postulación recibida', mensaje: 'Martín Gómez se postuló a "Pasante en Desarrollo Frontend (React)".', tipoVisual: 'success', accionURL: `/empresa/postulantes/${ofertas.frontend.id}`, leida: true, createdAt: daysAgo(12, 11) });
  await notif({ usuarioId: reclutador.id, tipo: 'chat', titulo: 'Nuevo mensaje de Martín Gómez', mensaje: 'Confirmó la entrevista técnica del jueves.', accionURL: '/chat', createdAt: daysAgo(7, 18) });
  await notif({ usuarioId: reclutador.id, tipo: 'postulacion', titulo: 'Nueva postulación recibida', mensaje: 'Martín Gómez se postuló a "Pasante en Desarrollo Backend (Node.js)".', tipoVisual: 'success', accionURL: `/empresa/postulantes/${ofertas.backend.id}`, createdAt: daysAgo(5, 11) });
  await notif({ usuarioId: reclutador.id, tipo: 'postulacion', titulo: 'Nueva postulación recibida', mensaje: 'Camila Ortiz se postuló a "Pasante en Desarrollo Backend (Node.js)".', tipoVisual: 'success', accionURL: `/empresa/postulantes/${ofertas.backend.id}`, createdAt: daysAgo(4, 11) });
  await notif({ usuarioId: reclutador.id, tipo: 'oferta', titulo: 'Tu oferta está pendiente de moderación', mensaje: '"Pasante en Análisis de Datos" fue enviada y espera la aprobación del administrador del sistema.', accionURL: '/empresa', createdAt: daysAgo(2, 10) });

  // 9d. Reclutadora (Lucía) — operación de SUS ofertas
  await notif({ usuarioId: reclutadora2.id, tipo: 'sistema', titulo: 'Te sumaron al equipo', mensaje: 'Ahora sos parte del equipo de Delta Innovación IT como reclutadora. Ya podés crear ofertas y gestionar candidatos.', tipoVisual: 'success', accionURL: '/empresa', leida: true, createdAt: daysAgo(38, 10) });
  await notif({ usuarioId: reclutadora2.id, tipo: 'oferta', titulo: 'Se te asignó una oferta', mensaje: 'Ahora sos responsable de "Trainee en QA y Automatización de Pruebas".', accionURL: `/empresa/postulantes/${ofertas.qa.id}`, leida: true, createdAt: daysAgo(21, 15) });
  await notif({ usuarioId: reclutadora2.id, tipo: 'postulacion', titulo: 'Nueva postulación recibida', mensaje: 'Martín Gómez se postuló a "Trainee en QA y Automatización de Pruebas".', tipoVisual: 'success', accionURL: `/empresa/postulantes/${ofertas.qa.id}`, leida: true, createdAt: daysAgo(20, 11) });
  await notif({ usuarioId: reclutadora2.id, tipo: 'postulacion', titulo: 'Nueva postulación recibida', mensaje: 'Nicolás Duarte se postuló a "Trainee en QA y Automatización de Pruebas".', tipoVisual: 'success', accionURL: `/empresa/postulantes/${ofertas.qa.id}`, createdAt: daysAgo(9, 11) });
  await notif({ usuarioId: reclutadora2.id, tipo: 'chat', titulo: 'Nuevo mensaje de Agustín Molina', mensaje: 'Confirmó la entrevista del martes para QA.', accionURL: '/chat', createdAt: daysAgo(9, 13) });
  await notif({ usuarioId: reclutadora2.id, tipo: 'oferta', titulo: 'Oferta próxima a vencer', mensaje: '"Trainee en QA y Automatización de Pruebas" cierra en 5 días. Revisá las postulaciones pendientes.', tipoVisual: 'warning', prioridad: 'alta', accionURL: '/empresa', createdAt: daysAgo(1, 9) });

  // 10. ACTIVITY LOGS (auditoría) ──────────────────────────────────────────
  say('🚀 Creando registros de auditoría...');

  // 203.0.113.0/24 (TEST-NET-3, RFC 5737): rango reservado exclusivamente
  // para documentación/ejemplos — nunca una IP real/routeable.
  const IP_DEMO = '203.0.113.10';
  let totalLogs = 0;
  async function log(data) {
    totalLogs += 1;
    await ActivityLog.create({ ip: IP_DEMO, ...data, createdAt: data.createdAt || daysAgo(1) }, { transaction });
  }

  await log({ usuarioId: reclutador.id, accion: 'login', entidad: 'usuario', entidadId: reclutador.id, createdAt: daysAgo(50, 10) });
  await log({ usuarioId: reclutador.id, accion: 'crear_oferta', entidad: 'oferta', entidadId: ofertas.ux.id, detalle: { titulo: ofertas.ux.titulo }, createdAt: daysAgo(43, 9) });
  await log({ usuarioId: reclutadora2.id, accion: 'login', entidad: 'usuario', entidadId: reclutadora2.id, createdAt: daysAgo(38, 11) });
  await log({ usuarioId: reclutadora2.id, accion: 'crear_oferta', entidad: 'oferta', entidadId: ofertas.soporte.id, detalle: { titulo: ofertas.soporte.titulo }, createdAt: daysAgo(35, 9) });
  await log({ usuarioId: reclutador.id, accion: 'crear_oferta', entidad: 'oferta', entidadId: ofertas.frontend.id, detalle: { titulo: ofertas.frontend.titulo }, createdAt: daysAgo(25, 9) });
  // QA la publicó Diego y al día siguiente Carolina se la reasignó a Lucía
  // (acción de gobierno del admin_empresa — queda auditada).
  await log({ usuarioId: reclutador.id, accion: 'crear_oferta', entidad: 'oferta', entidadId: ofertas.qa.id, detalle: { titulo: ofertas.qa.titulo }, createdAt: daysAgo(22, 9) });
  await log({ usuarioId: empAdmin.id, accion: 'reasignar_responsable_oferta', entidad: 'oferta', entidadId: ofertas.qa.id, detalle: { empresaId: empresa.id, responsableAnteriorId: reclutador.id, responsableNuevoId: reclutadora2.id }, createdAt: daysAgo(21, 15) });
  await log({ usuarioId: reclutador.id, accion: 'crear_oferta', entidad: 'oferta', entidadId: ofertas.backend.id, detalle: { titulo: ofertas.backend.titulo }, createdAt: daysAgo(18, 9) });
  await log({ usuarioId: reclutador.id, accion: 'crear_oferta', entidad: 'oferta', entidadId: ofertas.datos.id, detalle: { titulo: ofertas.datos.titulo }, createdAt: daysAgo(2, 10) });
  await log({ usuarioId: alumno.id, accion: 'login', entidad: 'usuario', entidadId: alumno.id, detalle: { rol: 'alumno' }, createdAt: daysAgo(20, 20) });
  await log({ usuarioId: alumno.id, accion: 'postular', entidad: 'oferta', entidadId: ofertas.qa.id, detalle: { titulo: ofertas.qa.titulo }, createdAt: daysAgo(20, 11) });
  await log({ usuarioId: alumno.id, accion: 'postular', entidad: 'oferta', entidadId: ofertas.frontend.id, detalle: { titulo: ofertas.frontend.titulo }, createdAt: daysAgo(12, 11) });
  await log({ usuarioId: alumno.id, accion: 'postular', entidad: 'oferta', entidadId: ofertas.backend.id, detalle: { titulo: ofertas.backend.titulo }, createdAt: daysAgo(5, 11) });
  await log({ usuarioId: reclutador.id, accion: 'cambiar_estado_postulacion', entidad: 'postulacion', detalle: { oferta: ofertas.frontend.titulo, candidato: 'Martín Gómez', de: 'preseleccionado', a: 'entrevista' }, createdAt: daysAgo(8, 12) });
  await log({ usuarioId: reclutadora2.id, accion: 'cambiar_estado_postulacion', entidad: 'postulacion', detalle: { oferta: ofertas.qa.titulo, candidato: 'Martín Gómez', de: 'entrevista', a: 'contratado' }, createdAt: daysAgo(14, 10) });
  await log({ usuarioId: empAdmin.id, accion: 'login', entidad: 'usuario', entidadId: empAdmin.id, detalle: { rol: 'empresa' }, createdAt: daysAgo(1, 17) });
  await log({ usuarioId: empAdmin.id, accion: 'cerrar_oferta', entidad: 'oferta', entidadId: ofertas.ux.id, detalle: { titulo: ofertas.ux.titulo, motivo: 'Vacante cubierta' }, createdAt: daysAgo(20, 15) });

  return {
    empAdmin, reclutador, reclutadora2, alumno, empresa, ofertas,
    candidatos: poolAlumnos.length,
    conversaciones: totalConversaciones,
    mensajes: totalMensajes,
    notificaciones: totalNotificaciones,
    logs: totalLogs,
  };
}

// ── API pública ─────────────────────────────────────────────────────────────

/**
 * ¿Ya está cargado el escenario de presentación?
 * Se considera presente si existen el admin_empresa demo y la empresa demo
 * (nunca depende de un admin — el escenario es independiente del admin real).
 */
async function escenarioExiste() {
  const [empAdmin, empresa] = await Promise.all([
    Usuario.findOne({ where: { email: EMP_ADMIN.email }, attributes: ['id'], paranoid: false }),
    Empresa.findOne({ where: { razonSocial: RAZON_SOCIAL }, attributes: ['id'], paranoid: false }),
  ]);
  return Boolean(empAdmin && empresa);
}

/**
 * Ejecuta el seed completo (limpia el escenario anterior y lo recrea) dentro
 * de una transacción. Idempotente. Devuelve un resumen.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.verbose=false]  imprime el progreso paso a paso
 */
async function ejecutarSeedPresentacion({ verbose = false } = {}) {
  VERBOSE = verbose;
  await exigirMigracionesAlDia(sequelize); // no migra: solo avisa si falta correr db:migrate
  const transaction = await sequelize.transaction();
  try {
    await limpiar(transaction);
    const r = await sembrar(transaction);
    await transaction.commit();

    const totalPost = await Postulacion.count({
      where: { ofertaId: { [Op.in]: Object.values(r.ofertas).map((o) => o.id) } },
    });

    return {
      password: PASSWORD,
      cuentas: [
        { rol: 'Admin de empresa', email: EMP_ADMIN.email },
        { rol: 'Reclutador', email: RECLUTA.email },
        { rol: 'Alumno', email: ALUMNO.email },
      ],
      empresa: r.empresa.razonSocial,
      reclutadores: 2,
      candidatos: r.candidatos,
      ofertas: Object.keys(r.ofertas).length,
      postulaciones: totalPost,
      conversaciones: r.conversaciones,
      mensajes: r.mensajes,
      notificaciones: r.notificaciones,
      logs: r.logs,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/**
 * Limpia el escenario de presentación SIN volver a sembrarlo (transaccional).
 * Solo borra lo que pertenece al escenario: el elenco de OUR_EMAILS, la
 * empresa demo y lo que cuelga de ellos. Lo usa showcaseReset.js.
 */
async function limpiarEscenarioPresentacion() {
  VERBOSE = false;
  const transaction = await sequelize.transaction();
  try {
    await limpiar(transaction);
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/**
 * Hook de arranque: si el escenario no está cargado, lo crea. Nunca lanza —
 * un fallo del seed no debe impedir que el servidor levante.
 *
 * @param {import('pino').Logger} [logger]
 */
async function seedPresentacionSiFalta(logger = console) {
  try {
    // DEPLOY-01: nunca sembrar el escenario de demo en producción de forma
    // automática, aunque SEED_PRESENTACION_ON_BOOT=true. Requiere la doble
    // confirmación ALLOW_PRODUCTION_DEMO_SEED=true.
    if (config.isProd && !config.seed.allowProductionDemoSeed) {
      logger.warn?.('Escenario de presentación en producción: bloqueado (seteá ALLOW_PRODUCTION_DEMO_SEED=true para permitirlo).');
      return;
    }
    if (await escenarioExiste()) {
      logger.info?.('Escenario de presentación ya cargado — se omite el seed');
      return;
    }
    logger.info?.('Escenario de presentación ausente — sembrando...');
    const resumen = await ejecutarSeedPresentacion({ verbose: false });
    // No loguear la contraseña demo en producción.
    const passInfo = config.isProd ? '' : ` — pass ${resumen.password}`;
    logger.info?.(
      { empresa: resumen.empresa, ofertas: resumen.ofertas, postulaciones: resumen.postulaciones },
      `Escenario de presentación creado (login demo: ${LOGIN_EMAILS.join(', ')}${passInfo})`
    );
  } catch (err) {
    logger.warn?.({ err }, 'No se pudo sembrar el escenario de presentación (el servidor sigue igual)');
  }
}

module.exports = {
  escenarioExiste,
  ejecutarSeedPresentacion,
  limpiarEscenarioPresentacion,
  seedPresentacionSiFalta,
  // Única fuente de verdad de las cuentas demo — la consume también
  // GET /api/demo/status (controllers/demo.controller.js) sin duplicar la lista.
  EMP_ADMIN,
  RECLUTA,
  ALUMNO,
  // Consumidos por showcaseStatus.js (diagnóstico de solo lectura) — así el
  // alcance de "qué es del escenario demo" vive en un solo lugar.
  RECLUTA_2,
  SOLICITUD_RECLUTADOR_PENDIENTE,
  RAZON_SOCIAL,
  LOGIN_EMAILS,
  CANDIDATO_EMAILS,
  OUR_EMAILS,
  SOLICITUD_EMPRESA_EMAIL,
};

// ── CLI: node src/utils/seedPresentacion.js ─────────────────────────────────

if (require.main === module) {
  // DEPLOY-01: crea usuarios y datos ficticios. En producción exige la doble
  // confirmación ALLOW_PRODUCTION_DEMO_SEED=true.
  bloquearSiProd('db:seed:presentacion', { overrideEnv: 'ALLOW_PRODUCTION_DEMO_SEED' });

  (async () => {
    try {
      await sequelize.authenticate();
      console.log(`✅ Conectado a "${config.db.name || 'DATABASE_URL'}".`);
      console.log('⚠️  Este seed crea usuarios y datos FICTICIOS. No borra usuarios reales.');
      const r = await ejecutarSeedPresentacion({ verbose: true });
      const passMostrada = config.isProd ? '(ver docs/DEPLOYMENT.md)' : r.password;

      console.log('\n✨ Escenario de presentación creado ✨\n');
      console.log('  Cuentas públicas de login (contraseña para las 3: ' + passMostrada + ')');
      console.log('  ┌─────────────────────────────────────────────────────────────');
      console.log(`  │ Admin de empresa      ${EMP_ADMIN.email}   (${RAZON_SOCIAL})`);
      console.log(`  │ Reclutador            ${RECLUTA.email}`);
      console.log(`  │ Alumno                ${ALUMNO.email}`);
      console.log('  └─────────────────────────────────────────────────────────────');
      console.log('  (El administrador real del sistema NO forma parte de este escenario —');
      console.log('   se crea únicamente con `npm run db:seed:admin`, ver docs/DEPLOYMENT.md.)');
      console.log(`  Empresa:        ${r.empresa} (aprobada, nivel de confianza estándar) — CUIT ${EMPRESA_CUIT}`);
      console.log(`  Equipo:         1 cuenta administradora + ${r.reclutadores} reclutadores activos (Diego Herrera y Lucía Ferrari)`);
      console.log(`  Ofertas:        ${r.ofertas} (6 con reclutador responsable + 1 histórica sin responsable, a propósito)`);
      console.log(`  Postulaciones:  ${r.postulaciones} (4 del alumno demo + 12 de candidatos sintéticos, en todo el embudo)`);
      console.log(`  Candidatos:     ${r.candidatos} usuarios sintéticos candidatoNN@demo.invalid (sin login en LoginPage)`);
      console.log(`  Chats:          ${r.conversaciones} conversaciones (${r.mensajes} mensajes) — equipo y reclutador ↔ candidato`);
      console.log(`  Notificaciones: ${r.notificaciones}`);
      console.log('  Solicitudes:    1 de reclutador pendiente (Mateo Silva) + 1 de empresa pendiente');
      console.log(`  Auditoría:      ${r.logs} registros en activity_logs`);
      console.log('  Verificar:      npm run db:seed:showcase:status\n');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error ejecutando seedPresentacion:', err);
      process.exit(1);
    }
  })();
}
