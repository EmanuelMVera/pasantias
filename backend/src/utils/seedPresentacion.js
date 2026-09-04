/**
 * seedPresentacion.js — Escenario de demo para la presentación del sistema.
 *
 * Crea 4 usuarios con credenciales fáciles de recordar y los "llena" con un
 * escenario coherente y navegable de punta a punta:
 *
 *   sistema@demo.com     → Administrador del sistema (rol admin)
 *   empresa@demo.com     → Administrador de empresa (rol empresa / admin_empresa)
 *   reclutador@demo.com  → Reclutador de esa misma empresa (rol empresa / reclutador)
 *   alumno@demo.com      → Alumno con perfil completo (rol alumno)
 *
 * Además siembra: 1 empresa aprobada + logo, 7 ofertas en todos los estados
 * (activa/moderada, activa sin moderar, pausada, cerrada, rechazada), CV del
 * alumno como Archivo, ~14 postulaciones (4 del alumno demo con historial de
 * estados completo + un pool de candidatos reales para el reclutador),
 * conversaciones de chat entre todos los roles, notificaciones de todos los
 * tipos, solicitudes de reclutador y de empresa pendientes, y registros de
 * auditoría (activity_logs).
 *
 * Es IDEMPOTENTE: cada corrida borra su propio escenario anterior (por email /
 * razón social) y lo vuelve a crear. No toca el resto de los datos demo.
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
 * Exporta: escenarioExiste(), ejecutarSeedPresentacion({ verbose }), seedPresentacionSiFalta(logger)
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

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

const PASSWORD = 'Demo1234!';

const ADMIN     = { email: 'sistema@demo.com',    nombre: 'Sofía',    apellido: 'Administradora' };
const EMP_ADMIN = { email: 'empresa@demo.com',    nombre: 'Carolina', apellido: 'Méndez' };
const RECLUTA   = { email: 'reclutador@demo.com', nombre: 'Diego',    apellido: 'Herrera' };
const ALUMNO    = { email: 'alumno@demo.com',     nombre: 'Martín',   apellido: 'Gómez' };

const RAZON_SOCIAL = 'Delta Innovación IT';
const EMPRESA_CUIT = '30712345689';
const SOLICITUD_EMPRESA_EMAIL = 'registro@nubecode.demo';

const OUR_EMAILS = [ADMIN.email, EMP_ADMIN.email, RECLUTA.email, ALUMNO.email];

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

// ── Limpieza del escenario anterior ─────────────────────────────────────────

async function limpiar(transaction) {
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

  const admin = await Usuario.create({
    ...base,
    rol: 'admin',
    nombre: ADMIN.nombre,
    apellido: ADMIN.apellido,
    email: ADMIN.email,
    telefono: '11-4000-1000',
    ubicacion: 'Avellaneda, Buenos Aires',
    fotoPerfil: 'https://i.pravatar.cc/150?img=47',
    ultimoAcceso: daysAgo(0, 9),
    createdAt: daysAgo(120),
  }, { transaction });

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
    createdAt: daysAgo(45),
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
    createdAt: daysAgo(30),
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
    createdAt: daysAgo(60),
  }, { transaction });

  // 2. ARCHIVOS (CV del alumno + logo de la empresa) ────────────────────────
  say('🚀 Creando archivos (CV / logo)...');

  const cvArchivo = await Archivo.create({
    usuarioPropietarioId: alumno.id,
    tipo: 'cv',
    nombreOriginal: 'CV - Martin Gomez.pdf',
    claveAlmacenamiento: 'uploads/private/cv/demo-alumno-martin-gomez.pdf',
    mimeType: 'application/pdf',
    tamanioBytes: 184320,
    backend: 'local',
    createdAt: daysAgo(20),
  }, { transaction });

  const logoArchivo = await Archivo.create({
    usuarioPropietarioId: empAdmin.id,
    tipo: 'logo_empresa',
    nombreOriginal: 'delta-innovacion-logo.png',
    claveAlmacenamiento: 'uploads/public/logo-delta-innovacion.png',
    mimeType: 'image/png',
    tamanioBytes: 40960,
    backend: 'local',
    createdAt: daysAgo(45),
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
    cvPath: cvArchivo.claveAlmacenamiento,
    cvArchivoId: cvArchivo.id,
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
    createdAt: daysAgo(60),
  }, { transaction });

  // 4. EMPRESA + EQUIPO ────────────────────────────────────────────────────
  say('🚀 Creando empresa y equipo...');

  const empresa = await Empresa.create({
    usuarioId: empAdmin.id,
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
    logo: logoArchivo.claveAlmacenamiento,
    estadoAprobacion: 'aprobada',
    aprobadaPorUsuarioId: admin.id,
    aprobadaEn: daysAgo(44, 11),
    createdAt: daysAgo(45),
  }, { transaction });

  await EmpresaUsuario.create({
    empresaId: empresa.id,
    usuarioId: empAdmin.id,
    rolInterno: 'admin_empresa',
    activo: true,
    createdAt: daysAgo(45),
  }, { transaction });

  await EmpresaUsuario.create({
    empresaId: empresa.id,
    usuarioId: reclutador.id,
    rolInterno: 'reclutador',
    activo: true,
    createdAt: daysAgo(30),
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
      moderada: true,
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
      moderada: true,
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
      moderada: true,
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
      moderada: true,
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
      moderada: false, // pendiente de moderación del admin
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
      moderada: true,
      vistas: 203,
      cantidadVacantes: 1,
      fechaPublicacion: daysAgo(70),
      fechaLimite: daysAgo(20),
      createdAt: daysAgo(70),
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
      estado: 'rechazada', // rechazada por moderación
      moderada: false,
      vistas: 3,
      cantidadVacantes: 1,
      fechaPublicacion: daysAgo(6),
      fechaLimite: daysAgo(-30),
      createdAt: daysAgo(6),
    },
  ];

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
      ...data,
    }, { transaction });
  }

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
        cambiadoPorUsuarioId: i === 0 ? usuario.id : reclutador.id,
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
    cvId: cvArchivo.id,
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
    cvId: cvArchivo.id,
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
    cvId: cvArchivo.id,
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
    diasBase: 55,
    cartaPresentacion:
      'Aunque mi foco es desarrollo, tengo interés en UX y manejo básico de Figma. Me gustaría ' +
      'aprender del proceso de diseño de producto.',
    notasEmpresa: 'Perfil más orientado a desarrollo que a diseño. Se sugiere postular a las vacantes técnicas.',
    cadena: ['en_revision', 'rechazado'],
  });

  // 6b. Pool de candidatos REALES (alumnos/egresados demo existentes) para que
  //     el reclutador tenga a quién gestionar en las ofertas activas.
  const poolAlumnos = await Usuario.findAll({
    where: { rol: { [Op.in]: ['alumno', 'egresado'] }, email: { [Op.like]: '%@itbeltran.com.ar' } },
    order: [['id', 'ASC']],
    limit: 10,
    transaction,
  });

  const poolPlan = [
    { oferta: 'frontend', estado: 'preseleccionado', cadena: ['en_revision', 'preseleccionado'] },
    { oferta: 'frontend', estado: 'en_revision', cadena: ['en_revision'] },
    { oferta: 'frontend', estado: 'rechazado', cadena: ['en_revision', 'rechazado'] },
    { oferta: 'backend', estado: 'entrevista', cadena: ['en_revision', 'preseleccionado', 'entrevista'] },
    { oferta: 'backend', estado: 'en_revision', cadena: ['en_revision'] },
    { oferta: 'qa', estado: 'rechazado', cadena: ['en_revision', 'rechazado'] },
    { oferta: 'qa', estado: 'en_revision', cadena: ['en_revision'] },
    { oferta: 'datos', estado: 'en_revision', cadena: ['en_revision'] },
    { oferta: 'soporte', estado: 'preseleccionado', cadena: ['en_revision', 'preseleccionado'] },
    { oferta: 'ux', estado: 'contratado', cadena: ['en_revision', 'preseleccionado', 'entrevista', 'contratado'] },
  ];

  for (let i = 0; i < poolPlan.length && i < poolAlumnos.length; i++) {
    const plan = poolPlan[i];
    const cand = poolAlumnos[i];
    await postular({
      usuario: cand,
      oferta: ofertas[plan.oferta],
      estado: plan.estado,
      diasBase: 8 + i * 2,
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

  await SolicitudReclutador.create({
    empresaId: empresa.id,
    nombre: 'Lucía',
    apellido: 'Ferrari',
    email: 'lucia.ferrari@deltainnovacion.com.ar',
    estado: 'pendiente',
    createdAt: daysAgo(3, 15),
  }, { transaction });

  await SolicitudReclutador.create({
    empresaId: empresa.id,
    nombre: 'Diego',
    apellido: 'Herrera',
    email: RECLUTA.email,
    estado: 'aprobado',
    createdAt: daysAgo(31, 10),
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

  async function conversacion(pares) {
    // pares: [{ de, a, texto, dias, hora, leido }]
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
    { de: reclutador, a: alumno, texto: 'Perfecto. Agendemos el jueves 15 a las 16:00. Es por videollamada, te llega el link por mail. Va a durar unos 45 minutos: repaso de tu experiencia y un ejercicio corto de React.', dias: 8, hora: 9 },
    { de: alumno, a: reclutador, texto: 'Genial, confirmado para el jueves 16:00. ¿Necesito preparar algo en particular?', dias: 8, hora: 13 },
    { de: reclutador, a: alumno, texto: 'Solo tener el entorno de desarrollo listo (Node + un editor). El ejercicio es sobre componentes y estado. Cualquier duda escribime.', dias: 8, hora: 14 },
    { de: alumno, a: reclutador, texto: '¡Perfecto! Nos vemos el jueves. Gracias Diego.', dias: 7, hora: 18, leido: false },
  ]);

  // 8b. Admin empresa ↔ Alumno demo — onboarding tras ser contratado en QA
  await conversacion([
    { de: empAdmin, a: alumno, texto: 'Hola Martín, soy Carolina, administradora de Delta Innovación IT. ¡Felicitaciones! Quedaste seleccionado para la pasantía de QA. Te escribo para coordinar el inicio.', dias: 4, hora: 11 },
    { de: alumno, a: empAdmin, texto: '¡Hola Carolina! Muchísimas gracias, qué buena noticia. Estoy disponible para empezar cuando me indiquen.', dias: 4, hora: 15 },
    { de: empAdmin, a: alumno, texto: 'Genial. El lunes que viene a las 10:00 en la oficina de Avellaneda para la inducción. Traé tu DNI y el certificado de alumno regular. Te enviamos el convenio de pasantía por mail para revisar.', dias: 3, hora: 9 },
    { de: alumno, a: empAdmin, texto: 'Perfecto, el lunes 10:00 estoy ahí con la documentación. Ya recibí el convenio, lo reviso y consulto si tengo dudas.', dias: 3, hora: 16, leido: false },
  ]);

  // 8c. Admin empresa ↔ Reclutador — coordinación interna del equipo
  await conversacion([
    { de: empAdmin, a: reclutador, texto: 'Diego, ¿cómo venimos con las postulaciones de Frontend? Necesito el resumen para la reunión de mañana.', dias: 6, hora: 10 },
    { de: reclutador, a: empAdmin, texto: 'Tenemos 4 postulaciones. Martín Gómez avanzó a entrevista técnica (jueves), uno preseleccionado más y dos en revisión. Uno lo descartamos por perfil.', dias: 6, hora: 11 },
    { de: empAdmin, a: reclutador, texto: 'Bien. Acordate de cargar las notas de cada candidato en el sistema así queda el historial. ¿La oferta de Datos ya está publicada?', dias: 6, hora: 11 },
    { de: reclutador, a: empAdmin, texto: 'Sí, la creé ayer pero todavía figura pendiente de moderación del admin del sistema. En cuanto la aprueben empieza a recibir postulaciones.', dias: 5, hora: 17 },
    { de: empAdmin, a: reclutador, texto: 'Perfecto. También llegó una solicitud de Lucía Ferrari para sumarse como reclutadora, la reviso yo.', dias: 5, hora: 18, leido: false },
  ]);

  // 8d. Admin del sistema ↔ Admin empresa — soporte / moderación
  await conversacion([
    { de: empAdmin, a: admin, texto: 'Hola, buenas. Publicamos una oferta de "Pasante en Análisis de Datos" y sigue como pendiente. ¿La pueden revisar? Gracias.', dias: 2, hora: 9 },
    { de: admin, a: empAdmin, texto: 'Hola Carolina. Sí, la tengo en la cola de moderación. La reviso hoy y te confirmo. La de Ciberseguridad la rechacé porque el detalle de tareas era muy escueto; pueden volver a cargarla con más información.', dias: 2, hora: 10 },
    { de: empAdmin, a: admin, texto: 'Entendido, la rehacemos con más detalle. ¡Gracias por la rapidez!', dias: 1, hora: 12, leido: false },
  ]);

  // 8e. Reclutador ↔ candidato del pool — mensaje corto
  if (poolAlumnos[0]) {
    await conversacion([
      { de: reclutador, a: poolAlumnos[0], texto: `Hola ${poolAlumnos[0].nombre}, gracias por postularte a Frontend. Quedaste preseleccionado/a, en los próximos días te contactamos para coordinar una entrevista.`, dias: 5, hora: 11 },
      { de: poolAlumnos[0], a: reclutador, texto: '¡Hola! Muchas gracias por el aviso. Quedo atento/a.', dias: 5, hora: 14, leido: false },
    ]);
  }

  // 9. NOTIFICACIONES ──────────────────────────────────────────────────────
  say('🚀 Creando notificaciones...');

  async function notif(data) {
    await Notificacion.create({
      leida: false,
      prioridad: 'normal',
      tipoVisual: 'info',
      ...data,
      createdAt: data.createdAt || daysAgo(1),
    }, { transaction });
  }

  // 9a. Alumno demo
  await notif({ usuarioId: alumno.id, tipo: 'estado', titulo: 'Avanzaste a Entrevista', mensaje: 'Tu postulación a "Pasante en Desarrollo Frontend (React)" en Delta Innovación IT pasó a estado Entrevista.', tipoVisual: 'success', prioridad: 'alta', accionURL: '/mis-postulaciones', leida: true, createdAt: daysAgo(9, 9) });
  await notif({ usuarioId: alumno.id, tipo: 'chat', titulo: 'Nuevo mensaje de Diego Herrera', mensaje: 'Tenés un mensaje nuevo sobre la coordinación de tu entrevista.', accionURL: '/chat', createdAt: daysAgo(8, 14) });
  await notif({ usuarioId: alumno.id, tipo: 'estado', titulo: '¡Fuiste contratado!', mensaje: 'Felicitaciones: fuiste seleccionado para la pasantía "Trainee en QA y Automatización de Pruebas".', tipoVisual: 'success', prioridad: 'urgente', accionURL: '/mis-postulaciones', createdAt: daysAgo(4, 10) });
  await notif({ usuarioId: alumno.id, tipo: 'estado', titulo: 'Actualización en tu postulación', mensaje: 'Tu postulación a "Pasante en Diseño UX/UI" fue actualizada a estado Rechazado.', tipoVisual: 'warning', accionURL: '/mis-postulaciones', leida: true, createdAt: daysAgo(53, 12) });
  await notif({ usuarioId: alumno.id, tipo: 'oferta', titulo: 'Nueva oferta compatible con tu perfil', mensaje: 'Se publicó "Pasante en Desarrollo Backend (Node.js)", compatible con tu área de interés (Desarrollo Web).', accionURL: '/ofertas', createdAt: daysAgo(18, 8) });
  await notif({ usuarioId: alumno.id, tipo: 'sistema', titulo: 'Completá tu perfil', mensaje: 'Los perfiles completos reciben hasta 3× más respuestas de las empresas. Revisá tu CV y tus habilidades.', prioridad: 'baja', accionURL: '/perfil', createdAt: daysAgo(30, 10) });

  // 9b. Admin de empresa
  await notif({ usuarioId: empAdmin.id, tipo: 'postulacion', titulo: 'Nueva postulación recibida', mensaje: 'Martín Gómez se postuló a "Pasante en Desarrollo Backend (Node.js)".', tipoVisual: 'success', accionURL: `/empresa/postulantes/${ofertas.backend.id}`, createdAt: daysAgo(5, 11) });
  await notif({ usuarioId: empAdmin.id, tipo: 'postulacion', titulo: 'Nueva postulación recibida', mensaje: 'Recibiste una nueva postulación para "Pasante en Desarrollo Frontend (React)".', tipoVisual: 'success', accionURL: `/empresa/postulantes/${ofertas.frontend.id}`, leida: true, createdAt: daysAgo(11, 12) });
  await notif({ usuarioId: empAdmin.id, tipo: 'oferta', titulo: 'Tu oferta fue aprobada', mensaje: '"Pasante en Desarrollo Frontend (React)" superó la moderación y ya es visible para los alumnos.', tipoVisual: 'success', accionURL: '/empresa', leida: true, createdAt: daysAgo(24, 13) });
  await notif({ usuarioId: empAdmin.id, tipo: 'oferta', titulo: 'Una de tus ofertas fue rechazada', mensaje: '"Pasante en Ciberseguridad" fue rechazada en la moderación. Motivo: el detalle de tareas es insuficiente. Podés volver a cargarla con más información.', tipoVisual: 'error', prioridad: 'alta', accionURL: '/empresa', createdAt: daysAgo(5, 16) });
  await notif({ usuarioId: empAdmin.id, tipo: 'sistema', titulo: 'Solicitud de acceso de reclutador', mensaje: 'Lucía Ferrari solicitó unirse a tu empresa como reclutadora. Revisá la solicitud en la sección Equipo.', tipoVisual: 'warning', prioridad: 'alta', accionURL: '/empresa/equipo', createdAt: daysAgo(3, 15) });
  await notif({ usuarioId: empAdmin.id, tipo: 'chat', titulo: 'Nuevo mensaje de Martín Gómez', mensaje: 'Respondió sobre la coordinación del inicio de la pasantía.', accionURL: '/chat', createdAt: daysAgo(3, 16) });

  // 9c. Reclutador
  await notif({ usuarioId: reclutador.id, tipo: 'sistema', titulo: 'Te sumaron al equipo', mensaje: 'Ahora sos parte del equipo de Delta Innovación IT como reclutador. Ya podés crear ofertas y gestionar candidatos.', tipoVisual: 'success', accionURL: '/empresa', leida: true, createdAt: daysAgo(30, 10) });
  await notif({ usuarioId: reclutador.id, tipo: 'postulacion', titulo: 'Nueva postulación recibida', mensaje: 'Martín Gómez se postuló a "Trainee en QA y Automatización de Pruebas".', tipoVisual: 'success', accionURL: `/empresa/postulantes/${ofertas.qa.id}`, leida: true, createdAt: daysAgo(20, 11) });
  await notif({ usuarioId: reclutador.id, tipo: 'postulacion', titulo: 'Nueva postulación recibida', mensaje: 'Recibiste una nueva postulación para "Pasante en Desarrollo Frontend (React)".', tipoVisual: 'success', accionURL: `/empresa/postulantes/${ofertas.frontend.id}`, createdAt: daysAgo(6, 9) });
  await notif({ usuarioId: reclutador.id, tipo: 'oferta', titulo: 'Oferta próxima a vencer', mensaje: '"Trainee en QA y Automatización de Pruebas" cierra en 5 días. Revisá las postulaciones pendientes.', tipoVisual: 'warning', prioridad: 'alta', accionURL: `/empresa/ofertas`, createdAt: daysAgo(1, 9) });
  await notif({ usuarioId: reclutador.id, tipo: 'oferta', titulo: 'Tu oferta está pendiente de moderación', mensaje: '"Pasante en Análisis de Datos" fue enviada y espera la aprobación del administrador del sistema.', accionURL: '/empresa', createdAt: daysAgo(2, 10) });
  await notif({ usuarioId: reclutador.id, tipo: 'chat', titulo: 'Nuevo mensaje de Martín Gómez', mensaje: 'Confirmó la entrevista técnica del jueves.', accionURL: '/chat', createdAt: daysAgo(7, 18) });

  // 9d. Admin del sistema
  await notif({ usuarioId: admin.id, tipo: 'sistema', titulo: 'Nueva solicitud de registro de empresa', mensaje: 'NubeCode SRL solicitó registrarse en la plataforma. Revisá la solicitud para aprobarla o rechazarla.', tipoVisual: 'warning', prioridad: 'alta', accionURL: '/admin/solicitudes', createdAt: daysAgo(1, 16) });
  await notif({ usuarioId: admin.id, tipo: 'oferta', titulo: 'Oferta pendiente de moderación', mensaje: 'Delta Innovación IT publicó "Pasante en Análisis de Datos". Requiere revisión antes de ser visible.', tipoVisual: 'warning', prioridad: 'alta', accionURL: '/admin/ofertas', createdAt: daysAgo(2, 9) });
  await notif({ usuarioId: admin.id, tipo: 'sistema', titulo: 'Resumen de actividad', mensaje: 'En los últimos 7 días: 14 nuevas postulaciones, 2 ofertas publicadas y 1 empresa pendiente de aprobación.', prioridad: 'baja', accionURL: '/admin', leida: true, createdAt: daysAgo(1, 8) });

  // 10. ACTIVITY LOGS (auditoría) ──────────────────────────────────────────
  say('🚀 Creando registros de auditoría...');

  async function log(data) {
    await ActivityLog.create({ ip: '190.220.14.7', ...data, createdAt: data.createdAt || daysAgo(1) }, { transaction });
  }

  await log({ usuarioId: admin.id, accion: 'login', entidad: 'usuario', entidadId: admin.id, detalle: { rol: 'admin' }, createdAt: daysAgo(45, 8) });
  await log({ usuarioId: admin.id, accion: 'aprobar_empresa', entidad: 'empresa', entidadId: empresa.id, detalle: { razonSocial: RAZON_SOCIAL, cuit: EMPRESA_CUIT }, createdAt: daysAgo(44, 11) });
  await log({ usuarioId: admin.id, accion: 'crear_usuario', entidad: 'usuario', entidadId: empAdmin.id, detalle: { rol: 'empresa', motivo: 'Alta admin_empresa al aprobar la empresa' }, createdAt: daysAgo(44, 11) });
  await log({ usuarioId: admin.id, accion: 'aprobar_solicitud_reclutador', entidad: 'usuario', entidadId: reclutador.id, detalle: { empresaId: empresa.id, email: RECLUTA.email }, createdAt: daysAgo(30, 10) });
  await log({ usuarioId: reclutador.id, accion: 'login', entidad: 'usuario', entidadId: reclutador.id, createdAt: daysAgo(30, 10) });
  await log({ usuarioId: reclutador.id, accion: 'crear_oferta', entidad: 'oferta', entidadId: ofertas.frontend.id, detalle: { titulo: ofertas.frontend.titulo }, createdAt: daysAgo(25, 9) });
  await log({ usuarioId: admin.id, accion: 'aprobar_oferta', entidad: 'oferta', entidadId: ofertas.frontend.id, detalle: { titulo: ofertas.frontend.titulo }, createdAt: daysAgo(24, 13) });
  await log({ usuarioId: reclutador.id, accion: 'crear_oferta', entidad: 'oferta', entidadId: ofertas.qa.id, detalle: { titulo: ofertas.qa.titulo }, createdAt: daysAgo(22, 9) });
  await log({ usuarioId: admin.id, accion: 'aprobar_oferta', entidad: 'oferta', entidadId: ofertas.qa.id, createdAt: daysAgo(22, 12) });
  await log({ usuarioId: reclutador.id, accion: 'crear_oferta', entidad: 'oferta', entidadId: ofertas.backend.id, detalle: { titulo: ofertas.backend.titulo }, createdAt: daysAgo(18, 9) });
  await log({ usuarioId: admin.id, accion: 'aprobar_oferta', entidad: 'oferta', entidadId: ofertas.backend.id, createdAt: daysAgo(18, 12) });
  await log({ usuarioId: reclutador.id, accion: 'crear_oferta', entidad: 'oferta', entidadId: ofertas.ciber.id, detalle: { titulo: ofertas.ciber.titulo }, createdAt: daysAgo(6, 9) });
  await log({ usuarioId: admin.id, accion: 'rechazar_oferta', entidad: 'oferta', entidadId: ofertas.ciber.id, detalle: { motivo: 'Detalle de tareas insuficiente' }, createdAt: daysAgo(5, 16) });
  await log({ usuarioId: reclutador.id, accion: 'crear_oferta', entidad: 'oferta', entidadId: ofertas.datos.id, detalle: { titulo: ofertas.datos.titulo }, createdAt: daysAgo(2, 10) });
  await log({ usuarioId: alumno.id, accion: 'login', entidad: 'usuario', entidadId: alumno.id, detalle: { rol: 'alumno' }, createdAt: daysAgo(20, 20) });
  await log({ usuarioId: alumno.id, accion: 'postular', entidad: 'oferta', entidadId: ofertas.qa.id, detalle: { titulo: ofertas.qa.titulo }, createdAt: daysAgo(20, 11) });
  await log({ usuarioId: alumno.id, accion: 'postular', entidad: 'oferta', entidadId: ofertas.frontend.id, detalle: { titulo: ofertas.frontend.titulo }, createdAt: daysAgo(12, 11) });
  await log({ usuarioId: alumno.id, accion: 'postular', entidad: 'oferta', entidadId: ofertas.backend.id, detalle: { titulo: ofertas.backend.titulo }, createdAt: daysAgo(5, 11) });
  await log({ usuarioId: reclutador.id, accion: 'cambiar_estado_postulacion', entidad: 'postulacion', detalle: { oferta: ofertas.frontend.titulo, candidato: 'Martín Gómez', de: 'preseleccionado', a: 'entrevista' }, createdAt: daysAgo(8, 12) });
  await log({ usuarioId: reclutador.id, accion: 'cambiar_estado_postulacion', entidad: 'postulacion', detalle: { oferta: ofertas.qa.titulo, candidato: 'Martín Gómez', de: 'entrevista', a: 'contratado' }, createdAt: daysAgo(4, 10) });
  await log({ usuarioId: empAdmin.id, accion: 'login', entidad: 'usuario', entidadId: empAdmin.id, detalle: { rol: 'empresa' }, createdAt: daysAgo(1, 17) });
  await log({ usuarioId: empAdmin.id, accion: 'cerrar_oferta', entidad: 'oferta', entidadId: ofertas.ux.id, detalle: { titulo: ofertas.ux.titulo, motivo: 'Vacante cubierta' }, createdAt: daysAgo(20, 15) });

  return { admin, empAdmin, reclutador, alumno, empresa, ofertas };
}

// ── API pública ─────────────────────────────────────────────────────────────

/**
 * ¿Ya está cargado el escenario de presentación?
 * Se considera presente si existen el admin del sistema y la empresa demo.
 */
async function escenarioExiste() {
  const [admin, empresa] = await Promise.all([
    Usuario.findOne({ where: { email: ADMIN.email }, attributes: ['id'], paranoid: false }),
    Empresa.findOne({ where: { razonSocial: RAZON_SOCIAL }, attributes: ['id'], paranoid: false }),
  ]);
  return Boolean(admin && empresa);
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
        { rol: 'Admin del sistema', email: ADMIN.email },
        { rol: 'Admin de empresa', email: EMP_ADMIN.email },
        { rol: 'Reclutador', email: RECLUTA.email },
        { rol: 'Alumno', email: ALUMNO.email },
      ],
      empresa: r.empresa.razonSocial,
      ofertas: Object.keys(r.ofertas).length,
      postulaciones: totalPost,
    };
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
    if (await escenarioExiste()) {
      logger.info?.('Escenario de presentación ya cargado — se omite el seed');
      return;
    }
    logger.info?.('Escenario de presentación ausente — sembrando...');
    const resumen = await ejecutarSeedPresentacion({ verbose: false });
    logger.info?.(
      { empresa: resumen.empresa, ofertas: resumen.ofertas, postulaciones: resumen.postulaciones },
      `Escenario de presentación creado (login demo: ${OUR_EMAILS.join(', ')} — pass ${resumen.password})`
    );
  } catch (err) {
    logger.warn?.({ err }, 'No se pudo sembrar el escenario de presentación (el servidor sigue igual)');
  }
}

module.exports = { escenarioExiste, ejecutarSeedPresentacion, seedPresentacionSiFalta };

// ── CLI: node src/utils/seedPresentacion.js ─────────────────────────────────

if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      console.log(`✅ Conectado a "${process.env.DB_NAME}".`);
      const r = await ejecutarSeedPresentacion({ verbose: true });

      console.log('\n✨ Escenario de presentación creado ✨\n');
      console.log('  Credenciales (contraseña para los 4: ' + r.password + ')');
      console.log('  ┌─────────────────────────────────────────────────────────────');
      console.log(`  │ Admin del sistema     ${ADMIN.email}`);
      console.log(`  │ Admin de empresa      ${EMP_ADMIN.email}   (${RAZON_SOCIAL})`);
      console.log(`  │ Reclutador            ${RECLUTA.email}`);
      console.log(`  │ Alumno                ${ALUMNO.email}`);
      console.log('  └─────────────────────────────────────────────────────────────');
      console.log(`  Empresa:        ${r.empresa} (aprobada) — CUIT ${EMPRESA_CUIT}`);
      console.log(`  Ofertas:        ${r.ofertas} (activa/moderada, activa sin moderar, pausada, cerrada, rechazada)`);
      console.log(`  Postulaciones:  ${r.postulaciones} (4 del alumno demo con historial completo)`);
      console.log(`  Chats:          5 conversaciones (20 mensajes) entre todos los roles`);
      console.log(`  Notificaciones: 21 (todos los tipos y prioridades)`);
      console.log(`  Solicitudes:    1 de reclutador (pendiente) + 1 de empresa (pendiente)`);
      console.log(`  Auditoría:      22 registros en activity_logs\n`);
      process.exit(0);
    } catch (err) {
      console.error('❌ Error ejecutando seedPresentacion:', err);
      process.exit(1);
    }
  })();
}
