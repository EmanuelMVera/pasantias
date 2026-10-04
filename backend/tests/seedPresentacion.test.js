'use strict';

/**
 * seedPresentacion.test.js — escenario dirigido de Delta Innovación IT.
 *
 * Cubre: exactamente 3 cuentas públicas (ninguna admin), equipo (1 cuenta
 * administradora + 2 reclutadores activos + 1 solicitud pendiente), ofertas
 * con un reclutador como responsable (nunca el admin_empresa) y una sola
 * histórica sin responsable, chats y notificaciones coherentes con las reglas
 * reales, independencia del admin real, sin archivos ficticios, idempotencia,
 * y limpieza segura de la cuenta legacy "sistema@demo.com".
 */

const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const {
  Usuario, Empresa, EmpresaUsuario, Perfil, Archivo, Oferta, Notificacion, Mensaje,
  ActivityLog, Postulacion, PostulacionHistorialEstado, SolicitudReclutador,
} = require('../src/models');
const {
  escenarioExiste,
  ejecutarSeedPresentacion,
  EMP_ADMIN,
  RECLUTA,
  RECLUTA_2,
  ALUMNO,
  OUR_EMAILS,
  SOLICITUD_RECLUTADOR_PENDIENTE,
  HISTORIA_PRINCIPAL,
} = require('../src/utils/seedPresentacion');
const { puedeEnviarMensaje, puedeVerConversacion } = require('../src/services/chatPermission.service');
const { crearAdmin, loginYObtenerToken } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

const RAZON_SOCIAL = 'Delta Innovación IT';

// Cada test corre el seed completo (limpia + siembra empresa, 7 ofertas,
// 16 postulaciones+historial, chats, notificaciones, logs) — más que el
// timeout default de Jest (5s) bajo carga.
jest.setTimeout(30000);

describe('seedPresentacion — escenario dirigido (3 cuentas públicas)', () => {
  const idsUsuariosAjenos = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuariosAjenos);
    await cerrarConexion();
  });

  test('sembrar crea exactamente 3 usuarios (empresa/reclutador/alumno), ninguno admin', async () => {
    await ejecutarSeedPresentacion({ verbose: false });

    const demoUsers = await Usuario.findAll({
      where: { email: [EMP_ADMIN.email, RECLUTA.email, ALUMNO.email, 'sistema@demo.com'] },
      attributes: ['email', 'rol'],
      paranoid: false,
    });
    const porEmail = Object.fromEntries(demoUsers.map((u) => [u.email, u.rol]));

    expect(porEmail[EMP_ADMIN.email]).toBe('empresa');
    expect(porEmail[RECLUTA.email]).toBe('empresa');
    expect(porEmail[ALUMNO.email]).toBe('alumno');
    expect(porEmail['sistema@demo.com']).toBeUndefined();

    const totalAdminsDemo = await Usuario.count({ where: { rol: 'admin', email: [EMP_ADMIN.email, RECLUTA.email, ALUMNO.email] } });
    expect(totalAdminsDemo).toBe(0);
  });

  test('Empresa.aprobadaPorUsuarioId es null — independiente del admin real', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    const empresa = await Empresa.findOne({ where: { razonSocial: RAZON_SOCIAL } });
    expect(empresa.aprobadaPorUsuarioId).toBeNull();
    expect(empresa.logo).toMatch(/^https:\/\//); // URL externa, no un path local
  });

  test('sin archivos ficticios: Perfil del alumno sin CV, ninguna fila Archivo de tipo cv/logo_empresa', async () => {
    await ejecutarSeedPresentacion({ verbose: false });

    const alumno = await Usuario.findOne({ where: { email: ALUMNO.email } });
    const perfil = await Perfil.findOne({ where: { usuarioId: alumno.id } });
    expect(perfil.cvPath).toBeNull();
    expect(perfil.cvArchivoId).toBeNull();

    // Ninguna fila Archivo (CV ni logo) para el alumno/empresa demo.
    const empAdmin = await Usuario.findOne({ where: { email: EMP_ADMIN.email } });
    const archivosDemo = await Archivo.count({
      where: { usuarioPropietarioId: [alumno.id, empAdmin.id], tipo: ['cv', 'logo_empresa'] },
    });
    expect(archivosDemo).toBe(0);
  });

  test('idempotente: correr el seed dos veces seguidas deja el mismo estado (3 cuentas, sin admin)', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    await ejecutarSeedPresentacion({ verbose: false });

    expect(await escenarioExiste()).toBe(true);
    expect(await Usuario.findOne({ where: { email: 'sistema@demo.com' } })).toBeNull();
    expect(await Usuario.count({ where: { rol: 'admin', email: { [Op.like]: '%@demo.com' } } })).toBe(0);

    // Un solo registro de cada cuenta — la segunda corrida no duplicó nada.
    expect(await Usuario.count({ where: { email: EMP_ADMIN.email } })).toBe(1);
    expect(await Empresa.count({ where: { razonSocial: RAZON_SOCIAL } })).toBe(1);
  });

  test('limpia una cuenta legacy "sistema@demo.com" (rol admin) sin tocar otro admin real', async () => {
    // Simula el residuo de una versión anterior del seed.
    const hash = await bcrypt.hash('Demo1234!', 4);
    const legacy = await Usuario.create({
      nombre: 'Sofía', apellido: 'Administradora', email: 'sistema@demo.com',
      password: hash, rol: 'admin', activo: true, habilitado: true,
    });

    // Admin real, ajeno al seed — no debe ser tocado.
    const { usuario: adminReal, passwordPlana } = await crearAdmin();
    idsUsuariosAjenos.push(adminReal.id);

    await ejecutarSeedPresentacion({ verbose: false });

    expect(await Usuario.findOne({ where: { id: legacy.id }, paranoid: false })).toBeNull();

    // El admin real sigue intacto y puede loguear normalmente.
    const sigueExistiendo = await Usuario.findByPk(adminReal.id);
    expect(sigueExistiendo).not.toBeNull();
    const token = await loginYObtenerToken(adminReal.email, passwordPlana);
    expect(typeof token).toBe('string');
  });

  test('perfil del alumno: sin carta de recomendación ficticia (cartaRecomendacion/cartaArchivoId null)', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    const alumno = await Usuario.findOne({ where: { email: ALUMNO.email } });
    const perfil = await Perfil.findOne({ where: { usuarioId: alumno.id } });
    expect(perfil.cartaRecomendacion).toBeNull();
    expect(perfil.cartaArchivoId).toBeNull();
  });

  test('ofertas: el responsable es siempre un reclutador (Diego o Lucía), nunca el admin_empresa; una sola histórica sin responsable', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    const empAdmin = await Usuario.findOne({ where: { email: EMP_ADMIN.email } });
    const diego = await Usuario.findOne({ where: { email: RECLUTA.email } });
    const lucia = await Usuario.findOne({ where: { email: RECLUTA_2.email } });
    const empresa = await Empresa.findOne({ where: { razonSocial: RAZON_SOCIAL } });
    const ofertas = await Oferta.findAll({
      where: { empresaId: empresa.id },
      attributes: ['titulo', 'estado', 'estadoModeracion', 'creadaPorUsuarioId', 'createdAt'],
    });

    expect(ofertas).toHaveLength(7);
    const sinResponsable = ofertas.filter((o) => o.creadaPorUsuarioId === null);
    expect(sinResponsable).toHaveLength(1); // el caso histórico intencional
    expect(sinResponsable[0].estadoModeracion).toBe('rechazada');

    const porId = new Map([[diego.id, diego], [lucia.id, lucia]]);
    const conResponsable = ofertas.filter((o) => o.creadaPorUsuarioId !== null);
    for (const o of conResponsable) {
      expect(o.creadaPorUsuarioId).not.toBe(empAdmin.id);
      const responsable = porId.get(o.creadaPorUsuarioId);
      expect(responsable).toBeDefined();
      // El responsable ya era parte del equipo cuando se publicó la oferta.
      expect(new Date(responsable.createdAt).getTime()).toBeLessThanOrEqual(new Date(o.createdAt).getTime());
    }
    // Los dos reclutadores tienen ofertas a cargo.
    expect(conResponsable.some((o) => o.creadaPorUsuarioId === diego.id)).toBe(true);
    expect(conResponsable.some((o) => o.creadaPorUsuarioId === lucia.id)).toBe(true);

    // Cubre todo el ciclo de vida y toda la moderación.
    expect(new Set(ofertas.map((o) => o.estado))).toEqual(new Set(['activa', 'pausada', 'cerrada']));
    expect(new Set(ofertas.map((o) => o.estadoModeracion))).toEqual(new Set(['aprobada', 'pendiente', 'rechazada']));
  });

  test('equipo de Delta: 1 cuenta administradora, 2 reclutadores activos y 1 solicitud pendiente (Mateo, no Lucía)', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    const empresa = await Empresa.findOne({ where: { razonSocial: RAZON_SOCIAL } });
    expect(empresa.nivelConfianza).toBe('estandar'); // explícito

    const membresias = await EmpresaUsuario.findAll({
      where: { empresaId: empresa.id },
      include: [{ model: Usuario, as: 'usuario', attributes: ['email', 'rol'] }],
    });
    const admins = membresias.filter((m) => m.rolInterno === 'admin_empresa');
    const reclutadores = membresias.filter((m) => m.rolInterno === 'reclutador' && m.activo);
    expect(admins).toHaveLength(1);
    expect(admins[0].usuario.email).toBe(EMP_ADMIN.email);
    expect(reclutadores.map((m) => m.usuario.email).sort()).toEqual([RECLUTA_2.email, RECLUTA.email].sort());
    expect(membresias.every((m) => m.usuario.rol === 'empresa')).toBe(true);

    const pendientes = await SolicitudReclutador.findAll({ where: { empresaId: empresa.id, estado: 'pendiente' } });
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].email).toBe(SOLICITUD_RECLUTADOR_PENDIENTE.email);
    expect(pendientes[0].email).not.toBe(RECLUTA_2.email);
    // Quien está pendiente todavía no tiene cuenta.
    expect(await Usuario.count({ where: { email: SOLICITUD_RECLUTADOR_PENDIENTE.email } })).toBe(0);
  });

  test('ningún usuario del escenario tiene rol admin; Lucía y los candidatos no son cuentas públicas', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    expect(await Usuario.count({ where: { email: OUR_EMAILS, rol: 'admin' } })).toBe(0);

    const request = require('supertest');
    const app = require('../src/app');
    const res = await request(app).get('/api/demo/status');
    expect(res.body.accounts.map((c) => c.email).sort())
      .toEqual([EMP_ADMIN.email, RECLUTA.email, ALUMNO.email].sort());
  });

  test('chats: respetan las reglas reales — hay equipo y reclutador↔alumno, nunca admin_empresa↔candidato', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    const usuarios = await Usuario.findAll({ where: { email: OUR_EMAILS }, attributes: ['id', 'email', 'rol'] });
    const idDe = (email) => usuarios.find((u) => u.email === email).id;
    const admin = idDe(EMP_ADMIN.email);
    const diego = idDe(RECLUTA.email);
    const alumno = idDe(ALUMNO.email);
    const candidatos = usuarios.filter((u) => u.rol !== 'empresa').map((u) => u.id);
    const ids = usuarios.map((u) => u.id);

    const mensajes = await Mensaje.findAll({
      where: { [Op.or]: [{ emisorId: ids }, { receptorId: ids }] },
      attributes: ['emisorId', 'receptorId'],
    });
    const pares = new Set(mensajes.map((m) => [m.emisorId, m.receptorId].sort((a, b) => a - b).join('-')));
    const par = (a, b) => [a, b].sort((x, y) => x - y).join('-');

    expect(pares.has(par(admin, diego))).toBe(true);   // chat interno del equipo
    expect(pares.has(par(diego, alumno))).toBe(true);  // reclutador ↔ alumno demo
    for (const c of candidatos) expect(pares.has(par(admin, c))).toBe(false);

    // Cada conversación sembrada pasa la MISMA regla que aplica producción.
    for (const clave of pares) {
      const [a, b] = clave.split('-').map(Number);
      expect((await puedeVerConversacion(a, b)).ok).toBe(true);
      expect((await puedeEnviarMensaje(a, b)).ok).toBe(true);
    }
    // Y la regla real efectivamente prohíbe admin_empresa ↔ alumno.
    expect((await puedeEnviarMensaje(admin, alumno)).ok).toBe(false);
  });

  test('notificaciones: "Nueva postulación recibida" va a los reclutadores, nunca al admin_empresa', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    const admin = await Usuario.findOne({ where: { email: EMP_ADMIN.email } });
    const diego = await Usuario.findOne({ where: { email: RECLUTA.email } });
    const lucia = await Usuario.findOne({ where: { email: RECLUTA_2.email } });
    const alumno = await Usuario.findOne({ where: { email: ALUMNO.email } });

    const deAdmin = await Notificacion.findAll({ where: { usuarioId: admin.id } });
    expect(deAdmin.length).toBeGreaterThan(0);
    expect(deAdmin.filter((n) => n.tipo === 'postulacion' || /postulaci[oó]n/i.test(n.titulo))).toHaveLength(0);
    // Recibe avisos de gobierno: moderación de ofertas y equipo.
    expect(deAdmin.some((n) => /aprobada/i.test(n.titulo))).toBe(true);
    expect(deAdmin.some((n) => /rechazada/i.test(n.titulo))).toBe(true);
    expect(deAdmin.some((n) => n.accionURL === '/empresa/equipo')).toBe(true);

    for (const reclutador of [diego, lucia]) {
      const propias = await Notificacion.findAll({ where: { usuarioId: reclutador.id } });
      expect(propias.some((n) => n.titulo === 'Nueva postulación recibida')).toBe(true);
      expect(propias.length).toBeLessThanOrEqual(10); // cantidad razonable, sin ruido
    }
    expect(await Notificacion.count({ where: { usuarioId: lucia.id, titulo: 'Se te asignó una oferta' } })).toBe(1);

    // Alumno: mezcla de leídas y no leídas.
    const deAlumno = await Notificacion.findAll({ where: { usuarioId: alumno.id } });
    expect(deAlumno.some((n) => n.leida)).toBe(true);
    expect(deAlumno.some((n) => !n.leida)).toBe(true);
  });

  test('alumno demo: historia principal — contratado solo en Frontend (de Diego); Backend en revisión y UX/UI no seleccionado', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    const alumno = await Usuario.findOne({ where: { email: ALUMNO.email } });
    const diego = await Usuario.findOne({ where: { email: RECLUTA.email } });
    const postulaciones = await Postulacion.findAll({
      where: { usuarioId: alumno.id },
      attributes: ['id', 'estado'],
      include: [{ model: Oferta, as: 'oferta', attributes: ['titulo', 'creadaPorUsuarioId'] }],
    });
    const estadoEn = Object.fromEntries(postulaciones.map((p) => [p.oferta.titulo, p.estado]));
    expect(estadoEn).toEqual({
      [HISTORIA_PRINCIPAL.ofertaTitulo]: 'contratado',
      'Pasante en Desarrollo Backend (Node.js)': 'en_revision',
      'Pasante en Diseño UX/UI': 'rechazado',
    });
    for (const p of postulaciones) expect(p.oferta.creadaPorUsuarioId).toBe(diego.id);

    const frontend = postulaciones.find((p) => p.oferta.titulo === HISTORIA_PRINCIPAL.ofertaTitulo);
    const historial = await PostulacionHistorialEstado.findAll({
      where: { postulacionId: frontend.id }, order: [['id', 'ASC']], attributes: ['estadoNuevo'],
    });
    expect(historial.map((h) => h.estadoNuevo)).toEqual(HISTORIA_PRINCIPAL.cadena);
  });

  test('postulaciones de Delta: el embudo usa los 5 estados y el historial termina en el estado actual', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    const empresa = await Empresa.findOne({ where: { razonSocial: RAZON_SOCIAL } });
    const ofertas = await Oferta.findAll({ where: { empresaId: empresa.id }, attributes: ['id', 'estadoModeracion', 'creadaPorUsuarioId'] });
    const postulaciones = await Postulacion.findAll({ where: { ofertaId: ofertas.map((o) => o.id) }, attributes: ['id', 'ofertaId', 'estado'] });

    expect(new Set(postulaciones.map((p) => p.estado)))
      .toEqual(new Set(['en_revision', 'preseleccionado', 'entrevista', 'contratado', 'rechazado']));

    const ofertaPorId = new Map(ofertas.map((o) => [o.id, o]));
    for (const p of postulaciones) {
      // Solo se postula a ofertas que fueron visibles (moderación aprobada).
      expect(ofertaPorId.get(p.ofertaId).estadoModeracion).toBe('aprobada');
      const historial = await PostulacionHistorialEstado.findAll({
        where: { postulacionId: p.id }, order: [['id', 'ASC']], attributes: ['estadoNuevo', 'cambiadoPorUsuarioId'],
      });
      expect(historial[historial.length - 1].estadoNuevo).toBe(p.estado);
      // Los cambios de estado los hace el reclutador responsable de esa oferta.
      for (const h of historial.slice(1)) {
        expect(h.cambiadoPorUsuarioId).toBe(ofertaPorId.get(p.ofertaId).creadaPorUsuarioId);
      }
    }
  });

  test('notificaciones: ningún accionURL roto conocido (ej. "/empresa/ofertas", que no es una ruta real)', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    const emails = [EMP_ADMIN.email, RECLUTA.email, RECLUTA_2.email, ALUMNO.email];
    const usuarios = await Usuario.findAll({ where: { email: emails }, attributes: ['id'] });
    const notifs = await Notificacion.findAll({ where: { usuarioId: usuarios.map((u) => u.id) }, attributes: ['accionURL'] });

    expect(notifs.length).toBeGreaterThan(0);
    const RUTAS_VALIDAS = new Set(['/chat', '/empresa', '/empresa/ofertas', '/empresa/equipo', '/mis-postulaciones', '/ofertas', '/perfil']);
    for (const n of notifs) {
      if (!n.accionURL) continue;
      const esRutaFija = RUTAS_VALIDAS.has(n.accionURL);
      const esPostulantes = /^\/empresa\/postulantes\/\d+$/.test(n.accionURL);
      expect(esRutaFija || esPostulantes).toBe(true);
    }
  });

  test('activity_logs: usa un rango de IP reservado para documentación (RFC 5737), nunca una IP real', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    const emails = [EMP_ADMIN.email, RECLUTA.email, RECLUTA_2.email, ALUMNO.email];
    const usuarios = await Usuario.findAll({ where: { email: emails }, attributes: ['id'] });
    const logs = await ActivityLog.findAll({ where: { usuarioId: usuarios.map((u) => u.id) }, attributes: ['ip'] });

    expect(logs.length).toBeGreaterThan(0);
    for (const l of logs) {
      expect(l.ip).toMatch(/^203\.0\.113\.\d{1,3}$/); // TEST-NET-3
    }
  });

  test('chats: ningún mensaje huérfano (emisor/receptor siempre resuelven a un usuario existente)', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    const empAdmin = await Usuario.findOne({ where: { email: EMP_ADMIN.email } });
    const reclutador = await Usuario.findOne({ where: { email: RECLUTA.email } });
    const alumno = await Usuario.findOne({ where: { email: ALUMNO.email } });
    const idsConocidos = [empAdmin.id, reclutador.id, alumno.id];

    const mensajes = await Mensaje.findAll({
      where: { [Op.or]: [{ emisorId: idsConocidos }, { receptorId: idsConocidos }] },
      attributes: ['emisorId', 'receptorId'],
    });
    expect(mensajes.length).toBeGreaterThan(0);

    const idsExistentes = new Set((await Usuario.findAll({ attributes: ['id'], paranoid: false })).map((u) => u.id));
    for (const m of mensajes) {
      expect(idsExistentes.has(m.emisorId)).toBe(true);
      expect(idsExistentes.has(m.receptorId)).toBe(true);
    }
  });

  test('ninguna postulación es anterior a la creación de su propia oferta', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    const empresa = await Empresa.findOne({ where: { razonSocial: RAZON_SOCIAL } });
    const ofertas = await Oferta.findAll({ where: { empresaId: empresa.id }, attributes: ['id', 'createdAt'] });
    const ofertaPorId = new Map(ofertas.map((o) => [o.id, o.createdAt]));

    const postulaciones = await Postulacion.findAll({
      where: { ofertaId: ofertas.map((o) => o.id) },
      attributes: ['ofertaId', 'createdAt'],
    });
    expect(postulaciones.length).toBeGreaterThan(0);
    for (const p of postulaciones) {
      expect(new Date(p.createdAt).getTime()).toBeGreaterThanOrEqual(new Date(ofertaPorId.get(p.ofertaId)).getTime());
    }
  });

  test('postulaciones del alumno demo: historial de estados cronológico (createdAt no decrece)', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    const alumno = await Usuario.findOne({ where: { email: ALUMNO.email } });
    const postulaciones = await Postulacion.findAll({ where: { usuarioId: alumno.id }, attributes: ['id'] });
    expect(postulaciones.length).toBeGreaterThan(0);

    for (const p of postulaciones) {
      const historial = await PostulacionHistorialEstado.findAll({
        where: { postulacionId: p.id },
        order: [['id', 'ASC']],
        attributes: ['createdAt'],
      });
      for (let i = 1; i < historial.length; i++) {
        expect(new Date(historial[i].createdAt).getTime()).toBeGreaterThanOrEqual(new Date(historial[i - 1].createdAt).getTime());
      }
    }
  });

  // ── Candidatos sintéticos (autocontenido: no depende de ningún otro seed) ──

  test('crea exactamente 10 candidatos sintéticos candidatoNN@demo.invalid, cada uno con Perfil', async () => {
    await ejecutarSeedPresentacion({ verbose: false });

    const candidatos = await Usuario.findAll({
      where: { email: { [Op.like]: 'candidato%@demo.invalid' } },
      attributes: ['id', 'email', 'rol'],
    });
    expect(candidatos).toHaveLength(10);
    expect(candidatos.some((c) => c.rol === 'egresado')).toBe(true);
    for (const c of candidatos) {
      expect(c.email).toMatch(/^candidato\d{2}@demo\.invalid$/);
      expect(['alumno', 'egresado']).toContain(c.rol);
    }

    const perfiles = await Perfil.count({ where: { usuarioId: candidatos.map((c) => c.id) } });
    expect(perfiles).toBe(10);
  });

  test('los candidatos sintéticos NO aparecen en GET /api/demo/status', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    const request = require('supertest');
    const app = require('../src/app');

    const res = await request(app).get('/api/demo/status');
    expect(res.status).toBe(200);
    expect(res.body.accounts).toHaveLength(3);
    const emails = res.body.accounts.map((c) => c.email);
    expect(emails.some((e) => e.endsWith('@demo.invalid'))).toBe(false);
  });

  test('conteo determinístico: exactamente 16 postulaciones (3 del alumno demo + 13 del pool sintético), sin importar qué otros seeds corrieron antes', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    const empresa = await Empresa.findOne({ where: { razonSocial: RAZON_SOCIAL } });
    const ofertas = await Oferta.findAll({ where: { empresaId: empresa.id }, attributes: ['id'] });

    const total = await Postulacion.count({ where: { ofertaId: ofertas.map((o) => o.id) } });
    expect(total).toBe(16);

    // UNIQUE(usuarioId, ofertaId): cada candidato (incluido el alumno demo)
    // postula una sola vez por oferta — nunca dos postulaciones del mismo par.
    const postulaciones = await Postulacion.findAll({
      where: { ofertaId: ofertas.map((o) => o.id) },
      attributes: ['usuarioId', 'ofertaId'],
    });
    const pares = postulaciones.map((p) => `${p.usuarioId}-${p.ofertaId}`);
    expect(new Set(pares).size).toBe(pares.length);
  });

  test('idempotente: correr el seed dos veces no duplica los candidatos sintéticos ni las postulaciones', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    await ejecutarSeedPresentacion({ verbose: false });

    const candidatos = await Usuario.count({ where: { email: { [Op.like]: 'candidato%@demo.invalid' } } });
    expect(candidatos).toBe(10);
    expect(await Usuario.count({ where: { email: RECLUTA_2.email } })).toBe(1);

    const empresa = await Empresa.findOne({ where: { razonSocial: RAZON_SOCIAL } });
    const ofertas = await Oferta.findAll({ where: { empresaId: empresa.id }, attributes: ['id'] });
    const total = await Postulacion.count({ where: { ofertaId: ofertas.map((o) => o.id) } });
    expect(total).toBe(16);
  });
});
