/**
 * showcaseStatus.js — diagnóstico de SOLO LECTURA del showcase (escenario de
 * presentación + dataset institucional).
 *
 * No crea, no modifica ni borra nada: solo SELECT/COUNT. No imprime ningún
 * secreto (ni passwords, ni hashes, ni tokens, ni la URL de la base).
 *
 * Además de contar, VALIDA que los datos ficticios respeten las reglas que el
 * sistema aplica de verdad, para que la demo no muestre nada incoherente:
 *   - el responsable de una oferta (`creadaPorUsuarioId`) es un reclutador de
 *     esa empresa, nunca el admin_empresa;
 *   - no hay chats admin_empresa ↔ candidato;
 *   - "Nueva postulación recibida" le llega al reclutador, no al admin_empresa;
 *   - ninguna postulación es anterior a su oferta, y el historial de estados
 *     termina en el estado actual;
 *   - ningún usuario con rol admin en los namespaces ficticios;
 *   - hay empresas de confianza y ofertas de publicación automática;
 *   - el ELENCO (S.H.I.E.L.D., Nick Fury, Tony / Thor / Steve, Sam Wilson
 *     pendiente, Peter Parker) y la HISTORIA PRINCIPAL (Tony → Frontend → Peter → contratado)
 *     está completa: responsable, estado, historial en orden, chat posterior a
 *     la entrevista, Peter sin notas internas, y los 3 reclutadores con trabajo propio
 *     (revisarElenco / revisarHistoriaPrincipal).
 *
 * Uso:
 *   npm run db:seed:showcase:status
 * Sale con código 1 si el showcase no está cargado o es incoherente.
 *
 * Sin Shell en Render: correr temporalmente como Build Command
 *   npm ci && npm run db:migrate && npm run db:seed:showcase:status
 * y revisar el log del deploy.
 *
 * Exporta: diagnosticarShowcase(), diagnosticarPresentacion(), diagnosticarInstitucional().
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Op } = require('sequelize');
const {
  sequelize, Usuario, Empresa, EmpresaUsuario, Oferta, Postulacion,
  PostulacionHistorialEstado, Mensaje, Notificacion, SolicitudReclutador,
} = require('../models');
const {
  escenarioExiste, EMP_ADMIN, RECLUTA, RECLUTA_2, RECLUTA_3, ALUMNO, SOLICITUD_RECLUTADOR_PENDIENTE, EMPRESA_CUIT,
  RAZON_SOCIAL, LOGIN_EMAILS, CANDIDATO_EMAILS, OUR_EMAILS, HISTORIA_PRINCIPAL,
} = require('./seedPresentacion');
const { DOMINIO, CUIT_PREFIJO } = require('./seedInstitucional');
const { esCuitValido } = require('../validators/common.validator');
const { formatearPostulacionAlumno } = require('../services/postulacion.service');

// Lo que el escenario de presentación tiene que tener (ver seedPresentacion.js).
const ESPERADO = {
  logins: 3,
  reclutadoresActivos: 3,
  solicitudesPendientes: 1,
  candidatos: 10,
  ofertas: 7,
  ofertasSinResponsable: 1,
  postulacionesMin: 14,
  postulacionesMax: 18,
};

const TITULO_NUEVA_POSTULACION = 'Nueva postulación recibida';

// ── Helpers de validación (compartidos por los dos datasets) ────────────────

function agregador() {
  const checks = [];
  return {
    checks,
    /** ok=false registra un error (o un warning si `nivel` es 'warn'). */
    check(ok, texto, nivel = 'error') {
      checks.push({ ok: Boolean(ok), nivel: ok ? 'ok' : nivel, texto });
    },
  };
}

const contarPor = (filas, campo) => filas.reduce((acc, f) => {
  acc[f[campo]] = (acc[f[campo]] || 0) + 1;
  return acc;
}, {});

/**
 * Clasifica el responsable de cada oferta según las membresías de su empresa.
 * @param {Array} ofertas      [{ empresaId, creadaPorUsuarioId }]
 * @param {Array} membresias   [{ empresaId, usuarioId, rolInterno, activo }]
 */
function revisarResponsables(ofertas, membresias) {
  const rol = new Map(membresias.map((m) => [`${m.empresaId}-${m.usuarioId}`, m]));
  const r = { conResponsable: 0, sinResponsable: 0, conAdminEmpresa: 0, fueraDelEquipo: 0, suspendidos: 0 };
  for (const o of ofertas) {
    if (!o.creadaPorUsuarioId) { r.sinResponsable += 1; continue; }
    r.conResponsable += 1;
    const m = rol.get(`${o.empresaId}-${o.creadaPorUsuarioId}`);
    if (!m) r.fueraDelEquipo += 1;
    else if (m.rolInterno !== 'reclutador') r.conAdminEmpresa += 1;
    else if (!m.activo) r.suspendidos += 1;
  }
  return r;
}

/** Postulaciones fechadas antes que su propia oferta. */
function contarAnterioresALaOferta(postulaciones, ofertas) {
  const creada = new Map(ofertas.map((o) => [o.id, new Date(o.createdAt).getTime()]));
  return postulaciones.filter((p) => new Date(p.createdAt).getTime() < creada.get(p.ofertaId)).length;
}

/** Postulaciones cuyo historial no termina en su estado actual (o no tienen historial). */
async function contarHistorialIncoherente(postulaciones) {
  if (postulaciones.length === 0) return 0;
  const historial = await PostulacionHistorialEstado.findAll({
    where: { postulacionId: { [Op.in]: postulaciones.map((p) => p.id) } },
    attributes: ['postulacionId', 'estadoNuevo'],
    order: [['id', 'ASC']],
    raw: true,
  });
  const ultimo = new Map();
  for (const h of historial) ultimo.set(h.postulacionId, h.estadoNuevo); // queda el último
  return postulaciones.filter((p) => ultimo.get(p.id) !== p.estado).length;
}

const mensajesEntre = (idsA, idsB) => (idsA.length && idsB.length
  ? Mensaje.count({
    where: {
      [Op.or]: [
        { emisorId: { [Op.in]: idsA }, receptorId: { [Op.in]: idsB } },
        { emisorId: { [Op.in]: idsB }, receptorId: { [Op.in]: idsA } },
      ],
    },
  })
  : 0);

const notifsNuevaPostulacion = (userIds) => (userIds.length
  ? Notificacion.count({ where: { usuarioId: { [Op.in]: userIds }, titulo: TITULO_NUEVA_POSTULACION } })
  : 0);

const nombreDe = (u) => `${u.nombre} ${u.apellido ?? ''}`.trim();

/**
 * Elenco del escenario dirigido: empresa, administrador, los 3 reclutadores,
 * la solicitud pendiente y el alumno principal — por email + nombre + relación,
 * nunca por id. Solo SELECT/COUNT.
 */
async function revisarElenco({ check, empresa, membresias, usuarios }) {
  check(Boolean(empresa), `Empresa demo: ${RAZON_SOCIAL}`);
  // Solo validación matemática (dígito verificador), sin consultar a AFIP.
  check(esCuitValido(EMPRESA_CUIT), `CUIT demo formalmente válido (${EMPRESA_CUIT})`);
  const persona = (cuenta) => usuarios.find((u) => u.email === cuenta.email
    && u.nombre === cuenta.nombre && u.apellido === cuenta.apellido);
  const miembro = (cuenta, rolInterno) => {
    const u = persona(cuenta);
    return Boolean(u) && membresias.some((m) => m.usuarioId === u.id && m.rolInterno === rolInterno && m.activo);
  };

  check(miembro(EMP_ADMIN, 'admin_empresa') && persona(EMP_ADMIN)?.rol === 'empresa',
    `${nombreDe(EMP_ADMIN)} es admin_empresa activo (rol global empresa)`);
  for (const r of [RECLUTA, RECLUTA_2, RECLUTA_3]) {
    check(miembro(r, 'reclutador'), `${nombreDe(r)} es reclutador activo`);
  }

  const [solicitudSam, cuentaSam] = await Promise.all([
    SolicitudReclutador.count({ where: { empresaId: empresa.id, email: SOLICITUD_RECLUTADOR_PENDIENTE.email, estado: 'pendiente' } }),
    Usuario.count({ where: { email: SOLICITUD_RECLUTADOR_PENDIENTE.email } }),
  ]);
  check(solicitudSam === 1 && cuentaSam === 0,
    `${nombreDe(SOLICITUD_RECLUTADOR_PENDIENTE)}: solicitud de reclutador pendiente (sin cuenta todavía)`);

  check(persona(ALUMNO)?.rol === 'alumno', `Alumno principal: ${nombreDe(ALUMNO)}`);
}

/**
 * Historia principal de la demo (HISTORIA_PRINCIPAL en seedPresentacion.js):
 * Tony → Frontend → Peter → contratado. Checks semánticos, no solo conteos.
 * Solo SELECT/COUNT (y una llamada pura a formatearPostulacionAlumno).
 */
async function revisarHistoriaPrincipal({ check, empresa, ofertas, postulaciones, ids }) {
  const { tonyId, thorId, steveId, alumnoId, adminId } = ids;
  const TONY = nombreDe(RECLUTA);
  const PETER = nombreDe(ALUMNO);

  const deTony = ofertas.filter((o) => o.creadaPorUsuarioId === tonyId);
  check(deTony.length > 0, `${TONY}: ${deTony.length} oferta/s a su cargo`);

  const frontend = await Oferta.findOne({
    where: { empresaId: empresa.id, titulo: HISTORIA_PRINCIPAL.ofertaTitulo },
    attributes: ['id', 'creadaPorUsuarioId'],
    raw: true,
  });
  check(Boolean(frontend) && frontend.creadaPorUsuarioId === tonyId,
    `Historia: "${HISTORIA_PRINCIPAL.ofertaTitulo}" pertenece a ${TONY}`);

  const post = frontend && alumnoId
    ? postulaciones.find((p) => p.ofertaId === frontend.id && p.usuarioId === alumnoId)
    : null;
  check(Boolean(post), `Historia: ${PETER} está postulado a Frontend`);
  check(post?.estado === 'contratado', `Historia: estado actual de ${PETER} en Frontend = ${post?.estado ?? 'sin postulación'}`);

  const historial = post
    ? await PostulacionHistorialEstado.findAll({
      where: { postulacionId: post.id },
      attributes: ['estadoAnterior', 'estadoNuevo', 'createdAt'],
      order: [['createdAt', 'ASC'], ['id', 'ASC']],
      raw: true,
    })
    : [];
  const cadena = historial.map((h) => h.estadoNuevo);
  const encadenado = historial.every((h, i) => (i === 0 ? h.estadoAnterior === null : h.estadoAnterior === cadena[i - 1]));
  const posteriorAPostular = post ? historial.every((h) => new Date(h.createdAt) >= new Date(post.createdAt)) : false;
  check(cadena.join('>') === HISTORIA_PRINCIPAL.cadena.join('>') && encadenado && posteriorAPostular,
    `Historia: historial de ${PETER}/Frontend = ${cadena.join(' → ') || 'vacío'}`);

  const entre = (a, b) => (a && b
    ? { [Op.or]: [{ emisorId: a, receptorId: b }, { emisorId: b, receptorId: a }] }
    : null);
  const tonyPeter = entre(tonyId, alumnoId);
  const contratadoEn = historial.find((h) => h.estadoNuevo === 'contratado')?.createdAt;
  const [chatTonyPeter, mensajesPosteriores, chatNickTony, chatNickPeter] = await Promise.all([
    tonyPeter ? Mensaje.count({ where: tonyPeter }) : 0,
    tonyPeter && contratadoEn
      ? Mensaje.count({ where: { ...tonyPeter, createdAt: { [Op.gt]: contratadoEn } } })
      : 0,
    mensajesEntre([adminId].filter(Boolean), [tonyId].filter(Boolean)),
    mensajesEntre([adminId].filter(Boolean), [alumnoId].filter(Boolean)),
  ]);
  check(chatTonyPeter > 0, `Historia: chat ${TONY} ↔ ${PETER}: ${chatTonyPeter} mensaje/s`);
  check(mensajesPosteriores > 0, `Historia: mensajes ${TONY} ↔ ${PETER} posteriores a la entrevista (tras la contratación): ${mensajesPosteriores}`);
  check(chatNickTony > 0, `Chat interno ${nombreDe(EMP_ADMIN)} ↔ ${TONY}: ${chatNickTony} mensaje/s`);
  check(chatNickPeter === 0, `Chat ${nombreDe(EMP_ADMIN)} (admin_empresa) ↔ ${PETER}: ${chatNickPeter}`);

  const contratacionesPeter = postulaciones.filter((p) => p.usuarioId === alumnoId && p.estado === 'contratado').length;
  check(contratacionesPeter === 1, `Historia: ${PETER} contratado en una sola oferta: ${contratacionesPeter}`);

  // Workspace de Tony: trabajo propio suficiente para la demo.
  const idsTony = new Set(deTony.map((o) => o.id));
  const candidatosTony = postulaciones.filter((p) => idsTony.has(p.ofertaId)).length;
  const [notifTony, notifOperativasAdmin] = await Promise.all([
    tonyId ? notifsNuevaPostulacion([tonyId]) : 0,
    adminId ? Notificacion.count({ where: { usuarioId: adminId, tipo: { [Op.in]: ['postulacion', 'estado'] } } }) : 0,
  ]);
  check(deTony.some((o) => o.estado === 'activa'), `${TONY}: ofertas activas: ${deTony.filter((o) => o.estado === 'activa').length}`);
  check(candidatosTony > 0, `${TONY}: candidatos en sus ofertas: ${candidatosTony}`);
  check(notifTony > 0, `${TONY}: notificaciones operativas "nueva postulación": ${notifTony}`);
  check(notifOperativasAdmin === 0, `Notificaciones operativas de postulaciones al admin_empresa: ${notifOperativasAdmin}`);

  // El alumno nunca recibe la nota interna: ni la vista del alumno la expone,
  // ni sus notificaciones contienen el texto de una nota o de una nota interna
  // del historial.
  const delAlumno = alumnoId
    ? await Postulacion.findAll({ where: { usuarioId: alumnoId }, attributes: ['id', 'estado', 'notasEmpresa', 'updatedAt'] })
    : [];
  const notasHist = delAlumno.length
    ? (await PostulacionHistorialEstado.findAll({
      where: { postulacionId: { [Op.in]: delAlumno.map((p) => p.id) }, notaInterna: { [Op.ne]: null } },
      attributes: ['notaInterna'], raw: true,
    })).map((h) => h.notaInterna)
    : [];
  const notas = [...delAlumno.map((p) => p.notasEmpresa).filter(Boolean), ...notasHist];
  const notifsAlumno = alumnoId
    ? await Notificacion.findAll({ where: { usuarioId: alumnoId }, attributes: ['titulo', 'mensaje'], raw: true })
    : [];
  const vistaConNota = delAlumno.filter((p) => 'notasEmpresa' in formatearPostulacionAlumno(p)).length;
  const notifConNota = notifsAlumno.filter((n) => notas.some((t) => `${n.titulo} ${n.mensaje}`.includes(t))).length;
  check(vistaConNota === 0 && notifConNota === 0, `${PETER} no recibe notas internas (vista: ${vistaConNota}, notificaciones: ${notifConNota})`);

  // Thor y Steve conservan sus propios procesos.
  for (const [cuenta, id] of [[RECLUTA_2, thorId], [RECLUTA_3, steveId]]) {
    const propias = new Set(ofertas.filter((o) => o.creadaPorUsuarioId === id).map((o) => o.id));
    const candidatos = postulaciones.filter((p) => propias.has(p.ofertaId)).length;
    check(Boolean(id) && propias.size > 0 && candidatos > 0,
      `${nombreDe(cuenta)}: ${propias.size} oferta/s propias con ${candidatos} candidato/s`);
  }
}

// ── Presentación ────────────────────────────────────────────────────────────

async function diagnosticarPresentacion() {
  const { checks, check } = agregador();

  if (!(await escenarioExiste())) {
    check(false, 'El escenario de presentación NO está cargado (npm run db:seed:presentacion)');
    return { cargado: false, datos: {}, checks };
  }

  const usuarios = await Usuario.findAll({
    where: { email: { [Op.in]: OUR_EMAILS } }, attributes: ['id', 'email', 'rol', 'nombre', 'apellido'], raw: true,
  });
  const idDe = (email) => usuarios.find((u) => u.email === email)?.id ?? null;
  const adminId = idDe(EMP_ADMIN.email);
  const alumnoId = idDe(ALUMNO.email);
  const reclutadorIds = [idDe(RECLUTA.email), idDe(RECLUTA_2.email), idDe(RECLUTA_3.email)].filter(Boolean);
  const candidatoIds = usuarios.filter((u) => CANDIDATO_EMAILS.includes(u.email)).map((u) => u.id);
  const logins = usuarios.filter((u) => LOGIN_EMAILS.includes(u.email)).length;

  const empresa = await Empresa.findOne({
    where: { razonSocial: RAZON_SOCIAL, cuit: EMPRESA_CUIT }, attributes: ['id', 'nivelConfianza'], raw: true,
  });
  const membresias = await EmpresaUsuario.findAll({
    where: { empresaId: empresa.id }, attributes: ['empresaId', 'usuarioId', 'rolInterno', 'activo'], raw: true,
  });
  const ofertas = await Oferta.findAll({
    where: { empresaId: empresa.id },
    attributes: ['id', 'empresaId', 'estado', 'estadoModeracion', 'creadaPorUsuarioId', 'createdAt'],
    raw: true,
  });
  const postulaciones = ofertas.length
    ? await Postulacion.findAll({
      where: { ofertaId: { [Op.in]: ofertas.map((o) => o.id) } },
      attributes: ['id', 'ofertaId', 'usuarioId', 'estado', 'createdAt'],
      raw: true,
    })
    : [];

  const [
    solicitudesPendientes, adminsIndebidos, historialIncoherente,
    chatEquipo, chatReclutadorAlumno, chatAdminCandidatos,
    notifReclutadores, notifAdmin,
  ] = await Promise.all([
    SolicitudReclutador.count({ where: { empresaId: empresa.id, estado: 'pendiente' } }),
    Usuario.count({ where: { email: { [Op.in]: OUR_EMAILS }, rol: 'admin' } }),
    contarHistorialIncoherente(postulaciones),
    mensajesEntre([adminId].filter(Boolean), reclutadorIds),
    mensajesEntre(reclutadorIds, [alumnoId].filter(Boolean)),
    mensajesEntre([adminId].filter(Boolean), [alumnoId, ...candidatoIds].filter(Boolean)),
    notifsNuevaPostulacion(reclutadorIds),
    notifsNuevaPostulacion([adminId].filter(Boolean)),
  ]);

  const adminsEmpresa = membresias.filter((m) => m.rolInterno === 'admin_empresa' && m.activo).length;
  const reclutadoresActivos = membresias.filter((m) => m.rolInterno === 'reclutador' && m.activo).length;
  const resp = revisarResponsables(ofertas, membresias);
  const anteriores = contarAnterioresALaOferta(postulaciones, ofertas);

  const datos = {
    adminsEmpresa,
    reclutadoresActivos,
    solicitudesPendientes,
    logins,
    candidatos: candidatoIds.length,
    nivelConfianza: empresa.nivelConfianza ?? null,
    ofertas: ofertas.length,
    ofertasPorEstado: contarPor(ofertas, 'estado'),
    ofertasPorModeracion: contarPor(ofertas, 'estadoModeracion'),
    ofertasConResponsable: resp.conResponsable,
    ofertasSinResponsable: resp.sinResponsable,
    ofertasConAdminEmpresa: resp.conAdminEmpresa,
    postulaciones: postulaciones.length,
    postulacionesPorEstado: contarPor(postulaciones, 'estado'),
    chatEquipo,
    chatReclutadorAlumno,
    chatAdminCandidatos,
    notifNuevaPostulacionReclutadores: notifReclutadores,
    notifNuevaPostulacionAdminEmpresa: notifAdmin,
    adminsIndebidos,
  };

  check(adminsEmpresa === 1, `Admin empresa demo: ${adminsEmpresa}`);
  check(reclutadoresActivos === ESPERADO.reclutadoresActivos, `Reclutadores activos: ${reclutadoresActivos}`);
  check(solicitudesPendientes === ESPERADO.solicitudesPendientes, `Solicitud reclutador pendiente: ${solicitudesPendientes}`);
  check(logins === ESPERADO.logins && Boolean(alumnoId), `Cuentas públicas de login: ${logins} (alumno login: ${alumnoId ? 1 : 0})`);
  check(candidatoIds.length === ESPERADO.candidatos, `Candidatos sintéticos: ${candidatoIds.length}`);
  check(['estandar', 'confiable'].includes(empresa.nivelConfianza), `Nivel de confianza de la empresa demo: ${empresa.nivelConfianza ?? 'sin definir'}`);

  const e = datos.ofertasPorEstado;
  check(ofertas.length === ESPERADO.ofertas,
    `Ofertas: ${ofertas.length} (activas: ${e.activa || 0}, pausadas: ${e.pausada || 0}, cerradas: ${e.cerrada || 0})`);
  check(resp.conResponsable === ofertas.length - ESPERADO.ofertasSinResponsable, `Ofertas con responsable: ${resp.conResponsable}`);
  check(resp.sinResponsable === ESPERADO.ofertasSinResponsable, `Ofertas sin responsable intencional: ${resp.sinResponsable}`);
  check(resp.conAdminEmpresa === 0, `Ofertas con admin_empresa como responsable: ${resp.conAdminEmpresa}`);
  check(resp.fueraDelEquipo === 0 && resp.suspendidos === 0,
    `Responsables que no son reclutadores activos de la empresa: ${resp.fueraDelEquipo + resp.suspendidos}`);

  check(postulaciones.length >= ESPERADO.postulacionesMin && postulaciones.length <= ESPERADO.postulacionesMax,
    `Postulaciones: ${postulaciones.length}`);
  check(Object.keys(datos.postulacionesPorEstado).length >= 4,
    `Estados distintos en el embudo: ${Object.keys(datos.postulacionesPorEstado).length}`, 'warn');
  check(anteriores === 0, `Postulaciones anteriores a su oferta: ${anteriores}`);
  check(historialIncoherente === 0, `Postulaciones cuyo historial no termina en su estado actual: ${historialIncoherente}`);

  check(chatEquipo > 0, `Chat admin_empresa ↔ reclutador: ${chatEquipo > 0 ? 'existe' : 'no existe'}`);
  check(chatReclutadorAlumno > 0, `Chat reclutador ↔ alumno: ${chatReclutadorAlumno > 0 ? 'existe' : 'no existe'}`);
  check(chatAdminCandidatos === 0, `Chat admin_empresa ↔ alumno/candidatos: ${chatAdminCandidatos}`);

  check(notifReclutadores > 0, `Notificación "nueva postulación" al reclutador: ${notifReclutadores > 0 ? 'existe' : 'no existe'}`);
  check(notifAdmin === 0, `Notificación "nueva postulación" al admin_empresa: ${notifAdmin}`);
  check(adminsIndebidos === 0, `Usuarios con rol admin en el escenario: ${adminsIndebidos}`);

  await revisarElenco({ check, empresa, membresias, usuarios });
  await revisarHistoriaPrincipal({
    check, empresa, ofertas, postulaciones,
    ids: {
      tonyId: idDe(RECLUTA.email), thorId: idDe(RECLUTA_2.email), steveId: idDe(RECLUTA_3.email), alumnoId, adminId,
    },
  });

  return { cargado: true, datos, checks };
}

// ── Institucional ───────────────────────────────────────────────────────────

async function diagnosticarInstitucional() {
  const { checks, check } = agregador();

  const usuarios = await Usuario.findAll({
    where: { email: { [Op.iLike]: `%@${DOMINIO}` } }, attributes: ['id', 'rol', 'ultimoAcceso'], raw: true,
  });
  if (usuarios.length === 0) {
    check(false, 'El dataset institucional NO está cargado (npm run db:seed:institucional)');
    return { cargado: false, datos: {}, checks };
  }
  const userIds = usuarios.map((u) => u.id);

  const empresas = await Empresa.findAll({
    where: { cuit: { [Op.like]: `${CUIT_PREFIJO}%` } }, attributes: ['id', 'nivelConfianza', 'cuit'], raw: true,
  });
  const empresaIds = empresas.map((x) => x.id);
  const confiables = new Set(empresas.filter((x) => x.nivelConfianza === 'confiable').map((x) => x.id));

  const membresias = empresaIds.length
    ? await EmpresaUsuario.findAll({
      where: { empresaId: { [Op.in]: empresaIds } },
      attributes: ['empresaId', 'usuarioId', 'rolInterno', 'activo'],
      raw: true,
    })
    : [];
  const ofertas = empresaIds.length
    ? await Oferta.findAll({
      where: { empresaId: { [Op.in]: empresaIds } },
      attributes: ['id', 'empresaId', 'estado', 'estadoModeracion', 'creadaPorUsuarioId', 'createdAt'],
      raw: true,
    })
    : [];
  const postulaciones = ofertas.length
    ? await Postulacion.findAll({
      where: { ofertaId: { [Op.in]: ofertas.map((o) => o.id) } },
      attributes: ['id', 'ofertaId', 'estado', 'createdAt'],
      raw: true,
    })
    : [];

  const adminEmpresaIds = membresias.filter((m) => m.rolInterno === 'admin_empresa').map((m) => m.usuarioId);
  const alumnoIds = usuarios.filter((u) => u.rol === 'alumno' || u.rol === 'egresado').map((u) => u.id);

  const [historialIncoherente, solicitudesPendientes, chatAdminAlumnos, notifAdmin] = await Promise.all([
    contarHistorialIncoherente(postulaciones),
    empresaIds.length ? SolicitudReclutador.count({ where: { empresaId: { [Op.in]: empresaIds }, estado: 'pendiente' } }) : 0,
    mensajesEntre(adminEmpresaIds, alumnoIds),
    notifsNuevaPostulacion(adminEmpresaIds),
  ]);

  const resp = revisarResponsables(ofertas, membresias);
  const anteriores = contarAnterioresALaOferta(postulaciones, ofertas);
  const autoAprobadas = ofertas.filter((o) => o.estadoModeracion === 'auto_aprobada');
  const autoAprobadasEnEstandar = autoAprobadas.filter((o) => !confiables.has(o.empresaId)).length;
  const adminsIndebidos = usuarios.filter((u) => u.rol === 'admin').length;
  const sinNivel = empresas.filter((x) => !['estandar', 'confiable'].includes(x.nivelConfianza)).length;

  const datos = {
    empresas: empresas.length,
    estandar: empresas.length - confiables.size,
    confiables: confiables.size,
    adminEmpresa: adminEmpresaIds.length,
    reclutadores: membresias.filter((m) => m.rolInterno === 'reclutador').length,
    reclutadoresSuspendidos: membresias.filter((m) => m.rolInterno === 'reclutador' && !m.activo).length,
    alumnosYEgresados: alumnoIds.length,
    usuariosSinUltimoAcceso: usuarios.filter((u) => !u.ultimoAcceso).length,
    solicitudesPendientes,
    ofertas: ofertas.length,
    ofertasPorModeracion: contarPor(ofertas, 'estadoModeracion'),
    ofertasAutoAprobadas: autoAprobadas.length,
    postulaciones: postulaciones.length,
    postulacionesPorEstado: contarPor(postulaciones, 'estado'),
    adminsIndebidos,
  };

  check(empresas.length > 0, `Empresas: ${empresas.length}`);
  const cuitsInvalidos = empresas.filter((x) => !esCuitValido(x.cuit)).length;
  check(cuitsInvalidos === 0, `Empresas institucionales con CUIT formalmente válido: ${empresas.length - cuitsInvalidos}/${empresas.length}`);
  check(sinNivel === 0 && datos.estandar > 0, `Estándar: ${datos.estandar}`);
  check(confiables.size > 0, `Confiables: ${confiables.size}`);
  check(datos.reclutadores > 0, `Reclutadores: ${datos.reclutadores} (suspendidos: ${datos.reclutadoresSuspendidos})`);
  check(alumnoIds.length > 0, `Alumnos/Egresados: ${alumnoIds.length}`);
  check(ofertas.length > 0, `Ofertas: ${ofertas.length}`);
  check(autoAprobadas.length > 0, `Ofertas publicación automática: ${autoAprobadas.length}`);
  check(autoAprobadasEnEstandar === 0, `Ofertas de publicación automática en empresas estándar: ${autoAprobadasEnEstandar}`);
  check(postulaciones.length > 0, `Postulaciones: ${postulaciones.length}`);

  check(resp.sinResponsable === 0, `Ofertas sin responsable: ${resp.sinResponsable}`);
  check(resp.conAdminEmpresa === 0, `Ofertas con admin_empresa como responsable: ${resp.conAdminEmpresa}`);
  check(resp.fueraDelEquipo === 0, `Ofertas con un responsable ajeno a la empresa: ${resp.fueraDelEquipo}`);
  check(anteriores === 0, `Postulaciones anteriores a su oferta: ${anteriores}`);
  check(historialIncoherente === 0, `Postulaciones cuyo historial no termina en su estado actual: ${historialIncoherente}`);
  check(chatAdminAlumnos === 0, `Chat admin_empresa ↔ alumno: ${chatAdminAlumnos}`);
  check(notifAdmin === 0, `Notificación "nueva postulación" al admin_empresa: ${notifAdmin}`);
  check(adminsIndebidos === 0, `Usuarios con rol admin en el dataset: ${adminsIndebidos}`);

  return { cargado: true, datos, checks };
}

// ── Showcase completo ───────────────────────────────────────────────────────

async function diagnosticarShowcase() {
  const presentacion = await diagnosticarPresentacion();
  const institucional = await diagnosticarInstitucional();
  const todos = [...presentacion.checks, ...institucional.checks];
  const errores = todos.filter((c) => c.nivel === 'error').length;
  const warnings = todos.filter((c) => c.nivel === 'warn').length;
  return { presentacion, institucional, errores, warnings, coherente: errores === 0 };
}

const SIMBOLO = { ok: '✓', warn: '⚠', error: '✗' };

/** Texto del informe (sin secretos). Lo usan el CLI y showcaseReset.js. */
function formatearInforme(r) {
  const lineas = ['SHOWCASE SISPASANTÍAS', '', 'PRESENTACIÓN', ''];
  for (const c of r.presentacion.checks) lineas.push(`${SIMBOLO[c.nivel]} ${c.texto}`);
  lineas.push('', 'INSTITUCIONAL', '');
  for (const c of r.institucional.checks) lineas.push(`${SIMBOLO[c.nivel]} ${c.texto}`);
  lineas.push('', 'RESULTADO:');
  if (r.coherente) {
    lineas.push(r.warnings ? `SHOWCASE COHERENTE (${r.warnings} advertencia/s)` : 'SHOWCASE COHERENTE');
  } else {
    lineas.push(`SHOWCASE INCOHERENTE — ${r.errores} error/es${r.warnings ? `, ${r.warnings} advertencia/s` : ''}`);
  }
  return lineas.join('\n');
}

module.exports = {
  diagnosticarShowcase,
  diagnosticarPresentacion,
  diagnosticarInstitucional,
  formatearInforme,
};

// ── CLI: node src/utils/showcaseStatus.js ───────────────────────────────────

if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      const r = await diagnosticarShowcase();
      console.log(formatearInforme(r));
      await sequelize.close();
      process.exit(r.coherente ? 0 : 1);
    } catch (err) {
      console.error('❌ Error en showcaseStatus:', err.message);
      process.exit(1);
    }
  })();
}
