/**
 * seedInstitucional.js — Dataset institucional amplio (Fase 1.5).
 *
 * Distinto de seedPresentacion.js a propósito: seedPresentacion es el
 * escenario DIRIGIDO de 3 cuentas públicas (login real, credenciales
 * documentadas, pensado para una demo guiada). Este script es un dataset
 * VOLUMÉTRICO — muchas empresas/personas/ofertas/postulaciones coherentes
 * entre sí, pensado para probar paginación, filtros, estadísticas y
 * exportación a una escala realista. No se tocan entre sí: cada uno limpia
 * y siembra únicamente su propio namespace (dominios de email distintos).
 *
 * Crea (namespace `@institucional.invalid`, nunca resuelve — RFC 2606):
 *   - 20 empresas, cada una con razón social + logo (URL https externa,
 *     nunca un objeto R2/Archivo) y CUIT determinístico único.
 *   - 1 admin_empresa + entre 1 y 3 reclutadores por empresa (39 reclutadores
 *     en total). El admin_empresa es la identidad INSTITUCIONAL de la cuenta
 *     (razón social + logo) — el nombre/apellido de la persona queda como
 *     dato secundario "Responsable de cuenta", igual criterio que
 *     Navbar.jsx/EquipoPage.jsx ya aplican (Fase 1C de esta misma iteración).
 *   - 80 alumnos/egresados con Perfil básico.
 *   - 1 oferta por reclutador (39 en total) — creadaPorUsuarioId siempre un
 *     reclutador, nunca un admin_empresa (RBAC-01, misma regla que rige el
 *     resto de la plataforma).
 *   - ~200 postulaciones (cada alumno aplica a 1-4 ofertas, siempre pares
 *     usuarioId+ofertaId distintos) con su cadena de PostulacionHistorialEstado.
 *   - Mensajes SOLO entre usuarios con una relación real: admin_empresa↔su
 *     primer reclutador (equipo), y reclutador responsable↔alumno cuando la
 *     postulación llegó a entrevista o contratado (nunca pares inventados).
 *   - Notificaciones (alumno + reclutador por cada postulación) y
 *     ActivityLog (crear_oferta, postular, cambiar_estado_postulacion).
 *   - CERO Archivo (sin CV/logo ficticios en disco ni en R2).
 *
 * Todo el texto/relación se genera DETERMINÍSTICAMENTE por índice (nunca
 * Math.random()) — la misma corrida produce siempre el mismo dataset, lo que
 * hace los tests de integridad exactos y reproducibles. La cronología usa un
 * "reloj lógico" que solo avanza (ver tick() en sembrar()): cada entidad
 * nueva queda, por construcción, en el mismo momento o después que todo lo
 * que ya se creó antes — así se evita la clase de bug encontrada en
 * seedPresentacion.js (una postulación fechada antes que su propia oferta).
 *
 * Password: UNA sola, aleatoria por corrida (crypto.randomBytes), hasheada
 * una vez y reusada para las ~139 cuentas — nunca se imprime ni se loguea.
 * No es la password pública `Demo1234!` de seedPresentacion: estas cuentas
 * no están pensadas para login interactivo, son datos para poblar paneles/
 * reportes/exportaciones a escala. Ninguna aparece en LoginPage ni en
 * GET /api/demo/status (esos dos solo conocen EMP_ADMIN/RECLUTA/ALUMNO de
 * seedPresentacion.js — nunca consultan la tabla usuarios por patrón).
 *
 * Es IDEMPOTENTE (limpia su propio namespace por dominio de email antes de
 * sembrar) y TRANSACCIONAL (todo o nada).
 *
 * Uso:
 *   npm run db:seed:institucional
 *   npm run db:seed:institucional:status   (solo lectura, ver seedInstitucionalStatus.js)
 *   npm run db:seed:institucional:clean    (limpia sin volver a sembrar)
 *
 * Exporta: escenarioInstitucionalExiste(), ejecutarSeedInstitucional({ verbose }),
 *          limpiarInstitucional(transaction) [reusado por el flag --clean],
 *          DOMINIO (única fuente de verdad del namespace, la reusa
 *          seedInstitucionalStatus.js sin duplicar el criterio).
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Op } = require('sequelize');

const { config } = require('../config/env');
const { bloquearSiProd } = require('./seedGuards');
const {
  sequelize, Usuario, Perfil, Empresa, EmpresaUsuario, Oferta, Postulacion,
  PostulacionHistorialEstado, Notificacion, Mensaje, ActivityLog, Archivo,
} = require('../models');
const { areas, habilidadesPorArea, carreras, rubroACarreras } = require('../data/catalogos.json');

// ── Namespace y escala ───────────────────────────────────────────────────────

const DOMINIO = 'institucional.invalid'; // RFC 2606, nunca resuelve
const EMPRESAS_COUNT = 20;
const ALUMNOS_COUNT = 80;
const reclutadoresPorEmpresa = (i) => (i % 3) + 1; // 1..3, determinístico

// ── Pools de datos (determinísticos, sin overlap con seedPresentacion.js) ──

const NOMBRES = [
  'Mariana', 'Gonzalo', 'Rocío', 'Emiliano', 'Antonella', 'Federico', 'Daniela',
  'Maximiliano', 'Pilar', 'Santiago', 'Guadalupe', 'Rodrigo', 'Victoria', 'Cristian',
  'Luciana', 'Matías', 'Ayelén', 'Sebastián', 'Zoe', 'Gastón', 'Yamila', 'Alejandro',
  'Brenda', 'Ezequiel', 'Paulina', 'Leandro', 'Melina', 'Ramiro', 'Ariadna', 'Ulises',
];
const APELLIDOS = [
  'Aguirre', 'Bazán', 'Castellano', 'Domínguez', 'Escobar', 'Farías', 'Giménez',
  'Huerta', 'Ibáñez', 'Juárez', 'Lozano', 'Maldonado', 'Navarro', 'Olmedo', 'Pereyra',
  'Quispe', 'Robles', 'Saavedra', 'Toledo', 'Urquiza', 'Valdez', 'Wagner', 'Ximénez',
  'Yañez', 'Zabala', 'Álvarez', 'Betancourt', 'Cabral', 'Delgado', 'Espinoza',
];
const CIUDADES = [
  'Avellaneda', 'Quilmes', 'Lanús', 'Lomas de Zamora', 'Banfield', 'Wilde',
  'Berazategui', 'Florencio Varela', 'Sarandí', 'Villa Domínico',
];
const EMPRESA_PREFIJOS = [
  'Nexo', 'Vórtice', 'Claro', 'Ámbar', 'Prisma', 'Aurora', 'Lumen', 'Vector',
  'Cénit', 'Andes', 'Austral', 'Boreal', 'Cardinal', 'Diagonal', 'Estuario',
  'Fénix', 'Galena', 'Horizonte', 'Ítaca', 'Jade',
];
const EMPRESA_SUFIJOS = [
  'Soluciones', 'Sistemas', 'Digital', 'Group', 'Labs', 'Tech', 'Consulting',
  'Software', 'Networks', 'Data',
];
const RUBROS = Object.keys(rubroACarreras);
const LOGO_COLORES = ['1e3a5f', '5f1e3a', '3a5f1e', '5f3a1e', '1e5f3a', '3a1e5f'];

const nombreCompleto = (idx) => `${NOMBRES[idx % NOMBRES.length]} ${APELLIDOS[(idx * 7) % APELLIDOS.length]}`;
const razonSocial = (i) => `${EMPRESA_PREFIJOS[i]} ${EMPRESA_SUFIJOS[i % EMPRESA_SUFIJOS.length]}`;
const cuitEmpresa = (i) => String(30700000000 + i); // 11 dígitos, único, determinístico
const logoUrl = (nombre, i) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre)}&background=${LOGO_COLORES[i % LOGO_COLORES.length]}&color=fff&size=150&bold=true&format=png`;

// ── Emails (namespace) ──────────────────────────────────────────────────────

const emailAdminEmpresa = (i) => `empresa${String(i + 1).padStart(2, '0')}.admin@${DOMINIO}`;
const emailReclutador = (i, r) => `empresa${String(i + 1).padStart(2, '0')}.reclutador${String(r + 1).padStart(2, '0')}@${DOMINIO}`;
const emailAlumno = (n) => `alumno${String(n + 1).padStart(3, '0')}@${DOMINIO}`;

// ── Limpieza (idempotencia) ──────────────────────────────────────────────────

/**
 * Borra todo el namespace institucional (por dominio de email) y lo que
 * cuelga de él. Reusado tanto por ejecutarSeedInstitucional (antes de
 * sembrar) como por el flag CLI --clean (sin volver a sembrar).
 */
async function limpiarInstitucional(transaction) {
  const usuarios = await Usuario.findAll({
    where: { email: { [Op.iLike]: `%@${DOMINIO}` } },
    attributes: ['id'],
    paranoid: false,
    transaction,
  });
  const userIds = usuarios.map((u) => u.id);

  const empresas = await Empresa.findAll({
    where: { cuit: { [Op.like]: '307000000%' } },
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
    await Archivo.destroy({ where: { usuarioPropietarioId: { [Op.in]: userIds } }, transaction, force: true });
  }

  if (empresaIds.length) {
    await Oferta.destroy({ where: { empresaId: { [Op.in]: empresaIds } }, transaction, force: true });
    await EmpresaUsuario.destroy({ where: { empresaId: { [Op.in]: empresaIds } }, transaction });
    await Empresa.destroy({ where: { id: { [Op.in]: empresaIds } }, transaction, force: true });
  }

  if (userIds.length) {
    await Perfil.destroy({ where: { usuarioId: { [Op.in]: userIds } }, transaction });
    await EmpresaUsuario.destroy({ where: { usuarioId: { [Op.in]: userIds } }, transaction });
    await Usuario.destroy({ where: { id: { [Op.in]: userIds } }, transaction, force: true });
  }
}

// ── Siembra ───────────────────────────────────────────────────────────────────

const ESTADOS_POSTULACION = ['en_revision', 'preseleccionado', 'entrevista', 'contratado', 'rechazado'];
const CADENA_POR_ESTADO = {
  en_revision: ['en_revision'],
  preseleccionado: ['en_revision', 'preseleccionado'],
  entrevista: ['en_revision', 'preseleccionado', 'entrevista'],
  contratado: ['en_revision', 'preseleccionado', 'entrevista', 'contratado'],
  rechazado: ['en_revision', 'rechazado'],
};

const ESTADO_OFERTA_PATTERN = [
  { estado: 'activa', moderada: true },
  { estado: 'activa', moderada: true },
  { estado: 'activa', moderada: false }, // pendiente de moderación
  { estado: 'pausada', moderada: true },
  { estado: 'cerrada', moderada: true },
  { estado: 'rechazada', moderada: false },
];

async function sembrar(transaction) {
  // ── Password: aleatoria por corrida, hasheada UNA sola vez, jamás impresa.
  const passwordAleatoria = crypto.randomBytes(24).toString('hex');
  const hash = await bcrypt.hash(passwordAleatoria, 12);
  const base = { password: hash, activo: true, habilitado: true };

  // ── Reloj lógico: solo avanza (decrece "días atrás"). Cada llamada a
  // tick() se usa para timestampear la entidad que se crea en ESE momento
  // del script — como siempre se llama en orden de dependencia (empresa →
  // reclutador → oferta → postulación → historial → notif/log/mensaje),
  // toda entidad queda cronológicamente en el mismo instante o después de
  // aquello de lo que depende, sin tener que calcular offsets a mano.
  const HOUR_MS = 60 * 60 * 1000;
  let cursorHoras = 520 * 24; // arranca ~520 días atrás
  function tick(minStep = 1, maxStep = 5) {
    const paso = minStep + (cursorHoras % (maxStep - minStep + 1));
    cursorHoras = Math.max(0, cursorHoras - paso);
    return new Date(Date.now() - cursorHoras * HOUR_MS);
  }

  // ── 1. EMPRESAS + EQUIPO ────────────────────────────────────────────────
  const empresas = [];       // { empresa, admin, reclutadores: [usuario,...] }
  for (let i = 0; i < EMPRESAS_COUNT; i++) {
    const nombreEmpresa = razonSocial(i);
    const tEmpresa = tick(1, 3);

    const admin = await Usuario.create({
      ...base,
      rol: 'empresa',
      nombre: NOMBRES[i % NOMBRES.length],
      apellido: APELLIDOS[(i * 11) % APELLIDOS.length],
      email: emailAdminEmpresa(i),
      ubicacion: `${CIUDADES[i % CIUDADES.length]}, Buenos Aires`,
      fotoPerfil: `https://i.pravatar.cc/150?img=${(i % 70) + 1}`,
      createdAt: tEmpresa,
      ultimoAcceso: tick(0, 2),
    }, { transaction });

    const rubro = RUBROS[i % RUBROS.length];
    const empresa = await Empresa.create({
      usuarioId: admin.id,
      razonSocial: nombreEmpresa,
      cuit: cuitEmpresa(i),
      descripcion: `${nombreEmpresa} es una empresa del rubro ${rubro} con sede en ${CIUDADES[i % CIUDADES.length]}. Dataset institucional generado para pruebas de escala.`,
      rubro,
      sitioWeb: `https://${nombreEmpresa.toLowerCase().replace(/\s+/g, '')}.demo.invalid`,
      telefono: `11-4${String(1000 + i).padStart(4, '0')}-${String(2000 + i).padStart(4, '0')}`,
      direccion: `Calle ${100 + i * 7}`,
      ciudad: CIUDADES[i % CIUDADES.length],
      // Logo por URL https externa — nunca un objeto R2 ni fila Archivo.
      logo: logoUrl(nombreEmpresa, i),
      estadoAprobacion: 'aprobada',
      aprobadaPorUsuarioId: null, // independiente del admin real, igual criterio que seedPresentacion
      aprobadaEn: tick(0, 1),
      createdAt: tEmpresa,
    }, { transaction });

    await EmpresaUsuario.create({
      empresaId: empresa.id, usuarioId: admin.id,
      rolInterno: 'admin_empresa', activo: true, createdAt: tEmpresa,
    }, { transaction });

    const numReclutadores = reclutadoresPorEmpresa(i);
    const reclutadores = [];
    for (let r = 0; r < numReclutadores; r++) {
      const tReclutador = tick(1, 4);
      const reclutador = await Usuario.create({
        ...base,
        rol: 'empresa',
        nombre: NOMBRES[(i + r + 5) % NOMBRES.length],
        apellido: APELLIDOS[(i * 3 + r * 13) % APELLIDOS.length],
        email: emailReclutador(i, r),
        ubicacion: `${CIUDADES[(i + r) % CIUDADES.length]}, Buenos Aires`,
        fotoPerfil: `https://i.pravatar.cc/150?img=${((i * 3 + r) % 70) + 1}`,
        createdAt: tReclutador,
        ultimoAcceso: tick(0, 3),
      }, { transaction });
      await EmpresaUsuario.create({
        empresaId: empresa.id, usuarioId: reclutador.id,
        rolInterno: 'reclutador', activo: true, createdAt: tReclutador,
      }, { transaction });
      reclutadores.push(reclutador);
    }

    empresas.push({ empresa, admin, reclutadores, rubro });
  }

  // ── 2. OFERTAS (una por reclutador — RBAC-01: siempre atribuida a un
  //     reclutador, nunca a un admin_empresa) ───────────────────────────────
  const ofertas = []; // { oferta, empresa, reclutador, empresaIdx }
  const TIPO_PUESTO = ['pasante', 'trainee', 'junior'];
  const NIVEL_POR_TIPO = { pasante: 'sin_experiencia', trainee: 'sin_experiencia', junior: 'junior' };
  let ofertaGlobalIdx = 0;
  for (let i = 0; i < empresas.length; i++) {
    const { empresa, reclutadores, rubro } = empresas[i];
    const carrerasDestinatarias = rubroACarreras[rubro] || [carreras[i % carreras.length]];
    for (const reclutador of reclutadores) {
      const area = areas[ofertaGlobalIdx % areas.length];
      const tipoPuesto = TIPO_PUESTO[ofertaGlobalIdx % TIPO_PUESTO.length];
      const { estado, moderada } = ESTADO_OFERTA_PATTERN[ofertaGlobalIdx % ESTADO_OFERTA_PATTERN.length];
      const tOferta = tick(1, 4);
      const oferta = await Oferta.create({
        empresaId: empresa.id,
        titulo: `${tipoPuesto === 'junior' ? 'Junior' : tipoPuesto === 'trainee' ? 'Trainee' : 'Pasante'} en ${area}`,
        descripcion: `Búsqueda de perfil para el área de ${area} en ${empresa.razonSocial}. Trabajo junto al equipo con mentoría y posibilidad de efectivización. Dataset institucional generado para pruebas de escala.`,
        requisitos: `Conocimientos básicos de ${area}. Se valoran ${(habilidadesPorArea[area] || []).slice(0, 2).join(' y ')}.`,
        area,
        modalidad: ['presencial', 'remoto', 'hibrido'][ofertaGlobalIdx % 3],
        salario: 280000 + (ofertaGlobalIdx % 10) * 8000,
        habilidadesRequeridas: (habilidadesPorArea[area] || []).slice(0, 4),
        tipoPuesto,
        nivelExperiencia: NIVEL_POR_TIPO[tipoPuesto],
        requiereExperiencia: false,
        carrerasDestinatarias,
        estado,
        moderada,
        vistas: 15 + (ofertaGlobalIdx * 13) % 300,
        cantidadVacantes: 1 + (ofertaGlobalIdx % 3),
        remuneracion: 'A convenir',
        beneficios: 'Mentoría y posibilidad de efectivización.',
        creadaPorUsuarioId: reclutador.id,
        fechaPublicacion: tOferta,
        fechaLimite: new Date(tOferta.getTime() + 30 * 24 * HOUR_MS),
        createdAt: tOferta,
      }, { transaction });
      ofertas.push({ oferta, empresa, reclutador, empresaIdx: i });
      ofertaGlobalIdx++;
    }
  }

  // ── 3. ALUMNOS/EGRESADOS + PERFIL ────────────────────────────────────────
  const alumnos = [];
  for (let n = 0; n < ALUMNOS_COUNT; n++) {
    const rol = n % 4 === 0 ? 'egresado' : 'alumno';
    const carrera = carreras[n % carreras.length];
    const tAlumno = tick(1, 3);
    const alumno = await Usuario.create({
      ...base,
      rol,
      nombre: NOMBRES[(n + 2) % NOMBRES.length],
      apellido: APELLIDOS[(n * 5 + 3) % APELLIDOS.length],
      email: emailAlumno(n),
      ubicacion: `${CIUDADES[n % CIUDADES.length]}, Buenos Aires`,
      fotoPerfil: `https://i.pravatar.cc/150?img=${(n % 70) + 1}`,
      createdAt: tAlumno,
      ultimoAcceso: tick(0, 4),
    }, { transaction });
    await Perfil.create({
      usuarioId: alumno.id,
      carrera,
      anioEgreso: rol === 'egresado' ? new Date().getFullYear() - 1 - (n % 3) : null,
      areaInteres: areas[n % areas.length],
      habilidades: (habilidadesPorArea[areas[n % areas.length]] || []).slice(0, 3),
      disponibilidad: 'inmediata',
      visibilidadPerfil: true,
      // Sin CV ficticio: cvPath/cvArchivoId quedan null (cero archivos, sección 5).
      createdAt: tAlumno,
    }, { transaction });
    alumnos.push(alumno);
  }

  // ── 4. POSTULACIONES + HISTORIAL ─────────────────────────────────────────
  // Cada alumno aplica a 1-4 ofertas; el stride de 7 (coprimo con la
  // cantidad total de ofertas, ~39) garantiza índices distintos por alumno
  // sin repetir nunca el par (usuarioId, ofertaId) — UNIQUE de la tabla.
  const totalOfertas = ofertas.length;
  const postulaciones = []; // { postulacion, oferta, reclutador, alumno, estado }
  for (let a = 0; a < alumnos.length; a++) {
    const alumno = alumnos[a];
    const numPost = 1 + (a % 4);
    for (let k = 0; k < numPost; k++) {
      const ofertaIdx = (a + k * 7) % totalOfertas;
      const { oferta, reclutador } = ofertas[ofertaIdx];
      const estado = ESTADOS_POSTULACION[(a * 3 + k) % ESTADOS_POSTULACION.length];
      const cadena = CADENA_POR_ESTADO[estado];

      // Se calculan ANTES de crear la fila los timestamps de toda la cadena
      // de historial, así Postulacion.updatedAt queda seteado a la fecha del
      // último paso ya en el propio .create() — un .update() posterior
      // pisaría este valor con la hora actual (Sequelize fuerza updatedAt en
      // cada UPDATE salvo { silent: true }), así que se evita ese llamado.
      const tPost = tick(1, 3);
      const tsHistorial = cadena.map((_, s) => (s === 0 ? tPost : tick(1, 2)));
      const tUltimo = tsHistorial[tsHistorial.length - 1];

      const post = await Postulacion.create({
        usuarioId: alumno.id,
        ofertaId: oferta.id,
        cartaPresentacion: `Postulación generada para el dataset institucional (alumno ${alumno.id}, oferta "${oferta.titulo}").`,
        estado,
        fechaPostulacion: tPost,
        notasEmpresa: estado === 'rechazado' ? 'No avanza en esta instancia.' : estado === 'contratado' ? 'Seleccionado/a.' : null,
        createdAt: tPost,
        updatedAt: tUltimo,
      }, { transaction });

      let anterior = null;
      for (let s = 0; s < cadena.length; s++) {
        const nuevo = cadena[s];
        await PostulacionHistorialEstado.create({
          postulacionId: post.id,
          estadoAnterior: anterior,
          estadoNuevo: nuevo,
          cambiadoPorUsuarioId: s === 0 ? alumno.id : reclutador.id,
          motivo: s === 0 ? 'Postulación enviada por el alumno.' : `Cambio de estado a "${nuevo}".`,
          createdAt: tsHistorial[s],
        }, { transaction });
        anterior = nuevo;
      }

      postulaciones.push({ postulacion: post, oferta, reclutador, alumno, estado });
    }
  }

  // ── 5. MENSAJES — solo entre usuarios con relación real ──────────────────
  // (a) admin_empresa ↔ su primer reclutador (equipo interno).
  for (const { empresa, admin, reclutadores } of empresas) {
    if (reclutadores.length === 0) continue;
    const reclutador = reclutadores[0];
    const t1 = tick(1, 3);
    const t2 = tick(0, 2);
    await Mensaje.create({
      emisorId: admin.id, receptorId: reclutador.id,
      mensaje: `Hola, ¿cómo vienen las búsquedas activas de ${empresa.razonSocial}?`,
      leido: true, createdAt: t1, updatedAt: t1,
    }, { transaction });
    await Mensaje.create({
      emisorId: reclutador.id, receptorId: admin.id,
      mensaje: 'Avanzando bien, te paso el resumen esta semana.',
      leido: true, createdAt: t2, updatedAt: t2,
    }, { transaction });
  }

  // (b) reclutador responsable ↔ alumno — solo si la postulación llegó a
  //     entrevista o contratado (relación real: hubo avance del proceso).
  for (const { oferta, reclutador, alumno, estado } of postulaciones) {
    if (estado !== 'entrevista' && estado !== 'contratado') continue;
    const t1 = tick(1, 3);
    const t2 = tick(0, 2);
    await Mensaje.create({
      emisorId: reclutador.id, receptorId: alumno.id,
      mensaje: `Hola ${alumno.nombre}, avanzaste en el proceso de "${oferta.titulo}". Te contactamos para coordinar los próximos pasos.`,
      leido: true, createdAt: t1, updatedAt: t1,
    }, { transaction });
    await Mensaje.create({
      emisorId: alumno.id, receptorId: reclutador.id,
      mensaje: 'Genial, muchas gracias por el aviso. Quedo atento/a.',
      leido: false, createdAt: t2, updatedAt: t2,
    }, { transaction });
  }

  // ── 6. NOTIFICACIONES ─────────────────────────────────────────────────────
  for (const { oferta, reclutador, alumno, estado } of postulaciones) {
    const tN1 = tick(0, 2);
    await Notificacion.create({
      usuarioId: alumno.id,
      tipo: 'estado',
      tipoVisual: estado === 'contratado' ? 'success' : estado === 'rechazado' ? 'warning' : 'info',
      prioridad: estado === 'contratado' ? 'urgente' : 'normal',
      titulo: estado === 'en_revision' ? 'Postulación enviada' : `Actualización de tu postulación`,
      mensaje: `Tu postulación a "${oferta.titulo}" está en estado ${estado.replace('_', ' ')}.`,
      leida: estado === 'en_revision',
      accionURL: '/mis-postulaciones',
      createdAt: tN1,
    }, { transaction });

    const tN2 = tick(0, 2);
    await Notificacion.create({
      usuarioId: reclutador.id,
      tipo: 'postulacion',
      tipoVisual: 'success',
      prioridad: 'normal',
      titulo: 'Nueva postulación recibida',
      mensaje: `${alumno.nombre} ${alumno.apellido} se postuló a "${oferta.titulo}".`,
      leida: true,
      accionURL: `/empresa/postulantes/${oferta.id}`,
      createdAt: tN2,
    }, { transaction });
  }

  // ── 7. ACTIVITY LOGS (auditoría) ──────────────────────────────────────────
  const IP_DEMO = '203.0.113.20'; // TEST-NET-3 (RFC 5737), nunca una IP real
  for (const { oferta, reclutador } of ofertas) {
    await ActivityLog.create({
      ip: IP_DEMO, usuarioId: reclutador.id, accion: 'crear_oferta',
      entidad: 'oferta', entidadId: oferta.id, detalle: { titulo: oferta.titulo },
      createdAt: oferta.createdAt,
    }, { transaction });
  }
  for (const { postulacion, oferta, reclutador, alumno, estado } of postulaciones) {
    await ActivityLog.create({
      ip: IP_DEMO, usuarioId: alumno.id, accion: 'postular',
      entidad: 'oferta', entidadId: oferta.id, detalle: { titulo: oferta.titulo },
      createdAt: postulacion.createdAt,
    }, { transaction });
    if (estado !== 'en_revision') {
      await ActivityLog.create({
        ip: IP_DEMO, usuarioId: reclutador.id, accion: 'cambiar_estado_postulacion',
        entidad: 'postulacion', entidadId: postulacion.id,
        detalle: { oferta: oferta.titulo, a: estado },
        createdAt: postulacion.updatedAt,
      }, { transaction });
    }
  }

  return {
    empresas: empresas.length,
    reclutadores: empresas.reduce((acc, e) => acc + e.reclutadores.length, 0),
    alumnos: alumnos.length,
    ofertas: ofertas.length,
    postulaciones: postulaciones.length,
    passwordAleatoria, // se descarta al volver del CLI — nunca se imprime
  };
}

// ── API pública ─────────────────────────────────────────────────────────────

/** ¿Ya está cargado el dataset institucional? */
async function escenarioInstitucionalExiste() {
  const count = await Usuario.count({ where: { email: { [Op.iLike]: `%@${DOMINIO}` } } });
  return count > 0;
}

/**
 * Ejecuta el seed institucional completo (limpia + siembra) en una
 * transacción. Idempotente.
 */
async function ejecutarSeedInstitucional({ verbose = false } = {}) {
  const transaction = await sequelize.transaction();
  try {
    await limpiarInstitucional(transaction);
    const r = await sembrar(transaction);
    await transaction.commit();
    if (verbose) console.log('✅ Dataset institucional sembrado.');
    return {
      empresas: r.empresas,
      reclutadores: r.reclutadores,
      alumnos: r.alumnos,
      ofertas: r.ofertas,
      postulaciones: r.postulaciones,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/** Limpia el namespace institucional SIN volver a sembrar (flag --clean). */
async function limpiarSoloInstitucional() {
  const transaction = await sequelize.transaction();
  try {
    await limpiarInstitucional(transaction);
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

module.exports = {
  escenarioInstitucionalExiste,
  ejecutarSeedInstitucional,
  limpiarSoloInstitucional,
  DOMINIO,
  EMPRESAS_COUNT,
  ALUMNOS_COUNT,
};

// ── CLI: node src/utils/seedInstitucional.js [--clean] ──────────────────────

if (require.main === module) {
  bloquearSiProd('db:seed:institucional', { overrideEnv: 'ALLOW_PRODUCTION_DEMO_SEED' });

  const soloLimpiar = process.argv.includes('--clean');

  (async () => {
    try {
      await sequelize.authenticate();
      console.log(`✅ Conectado a "${config.db.name || 'DATABASE_URL'}".`);

      if (soloLimpiar) {
        console.log('🧹 Limpiando dataset institucional (sin volver a sembrar)...');
        await limpiarSoloInstitucional();
        console.log('✅ Namespace institucional limpiado.');
        process.exit(0);
      }

      console.log('⚠️  Este seed crea datos FICTICIOS a escala (dataset institucional). No borra usuarios reales.');
      const r = await ejecutarSeedInstitucional({ verbose: false });
      console.log('\n✨ Dataset institucional creado ✨\n');
      console.log(`  Empresas:       ${r.empresas}`);
      console.log(`  Reclutadores:   ${r.reclutadores} (+ ${r.empresas} admin_empresa, 1 por empresa)`);
      console.log(`  Alumnos:        ${r.alumnos}`);
      console.log(`  Ofertas:        ${r.ofertas} (una por reclutador)`);
      console.log(`  Postulaciones:  ${r.postulaciones}`);
      console.log('  Password: aleatoria por corrida, NO se imprime — estas cuentas no están');
      console.log('  pensadas para login interactivo. Las 3 cuentas de LoginPage siguen siendo');
      console.log('  únicamente las de `npm run db:seed:presentacion`.\n');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error ejecutando seedInstitucional:', err);
      process.exit(1);
    }
  })();
}
