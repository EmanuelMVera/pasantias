'use strict';

/**
 * seedPresentacion.test.js — reescritura del seed de demo a 3 cuentas.
 *
 * Cubre: exactamente 3 cuentas (ninguna admin), independencia del admin real
 * (Empresa.aprobadaPorUsuarioId null), sin archivos ficticios (CV/logo),
 * idempotencia, y limpieza segura de una cuenta legacy "sistema@demo.com"
 * sin tocar ningún otro admin real.
 */

const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const {
  Usuario, Empresa, Perfil, Archivo, Oferta, Notificacion, Mensaje,
  ActivityLog, Postulacion, PostulacionHistorialEstado, sequelize,
} = require('../src/models');
const {
  escenarioExiste,
  ejecutarSeedPresentacion,
  EMP_ADMIN,
  RECLUTA,
  ALUMNO,
} = require('../src/utils/seedPresentacion');
const { crearAdmin, loginYObtenerToken } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

const RAZON_SOCIAL = 'Delta Innovación IT';

// Cada test corre el seed completo (limpia + siembra empresa, 7 ofertas,
// ~14 postulaciones+historial, chats, notificaciones, logs) — más que el
// timeout default de Jest (5s) bajo carga.
jest.setTimeout(30000);

describe('seedPresentacion — escenario de 3 cuentas', () => {
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

  test('ofertas: creadaPorUsuarioId coherente con la línea de tiempo — nunca un admin, nunca null', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    const empAdmin = await Usuario.findOne({ where: { email: EMP_ADMIN.email } });
    const reclutador = await Usuario.findOne({ where: { email: RECLUTA.email } });
    const empresa = await Empresa.findOne({ where: { razonSocial: RAZON_SOCIAL } });
    const ofertas = await Oferta.findAll({ where: { empresaId: empresa.id }, attributes: ['titulo', 'creadaPorUsuarioId', 'createdAt'] });

    expect(ofertas.length).toBeGreaterThan(0);
    const idsValidos = new Set([empAdmin.id, reclutador.id]);
    for (const o of ofertas) {
      expect(o.creadaPorUsuarioId).not.toBeNull();
      expect(idsValidos.has(o.creadaPorUsuarioId)).toBe(true);
      // Nunca una oferta atribuida a un creador cuya cuenta se creó DESPUÉS
      // de la propia oferta (coherencia narrativa mínima).
      const autor = o.creadaPorUsuarioId === empAdmin.id ? empAdmin : reclutador;
      expect(new Date(autor.createdAt).getTime()).toBeLessThanOrEqual(new Date(o.createdAt).getTime());
    }
  });

  test('notificaciones: ningún accionURL roto conocido (ej. "/empresa/ofertas", que no es una ruta real)', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    const emails = [EMP_ADMIN.email, RECLUTA.email, ALUMNO.email];
    const usuarios = await Usuario.findAll({ where: { email: emails }, attributes: ['id'] });
    const notifs = await Notificacion.findAll({ where: { usuarioId: usuarios.map((u) => u.id) }, attributes: ['accionURL'] });

    expect(notifs.length).toBeGreaterThan(0);
    const RUTAS_VALIDAS = new Set(['/chat', '/empresa', '/empresa/equipo', '/mis-postulaciones', '/ofertas', '/perfil']);
    for (const n of notifs) {
      if (!n.accionURL) continue;
      const esRutaFija = RUTAS_VALIDAS.has(n.accionURL);
      const esPostulantes = /^\/empresa\/postulantes\/\d+$/.test(n.accionURL);
      expect(esRutaFija || esPostulantes).toBe(true);
    }
  });

  test('activity_logs: usa un rango de IP reservado para documentación (RFC 5737), nunca una IP real', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    const emails = [EMP_ADMIN.email, RECLUTA.email, ALUMNO.email];
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

  // ── Candidatos sintéticos (autocontenido — ya no depende de seedDemo.js) ──

  test('crea exactamente 10 candidatos sintéticos candidatoNN@demo.invalid, cada uno con Perfil', async () => {
    await ejecutarSeedPresentacion({ verbose: false });

    const candidatos = await Usuario.findAll({
      where: { email: { [Op.like]: '%@demo.invalid' } },
      attributes: ['id', 'email', 'rol'],
    });
    expect(candidatos).toHaveLength(10);
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

  test('conteo determinístico: exactamente 14 postulaciones (4 del alumno demo + 10 del pool sintético), sin importar qué otros seeds corrieron antes', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    const empresa = await Empresa.findOne({ where: { razonSocial: RAZON_SOCIAL } });
    const ofertas = await Oferta.findAll({ where: { empresaId: empresa.id }, attributes: ['id'] });

    const total = await Postulacion.count({ where: { ofertaId: ofertas.map((o) => o.id) } });
    expect(total).toBe(14);

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

    const candidatos = await Usuario.count({ where: { email: { [Op.like]: '%@demo.invalid' } } });
    expect(candidatos).toBe(10);

    const empresa = await Empresa.findOne({ where: { razonSocial: RAZON_SOCIAL } });
    const ofertas = await Oferta.findAll({ where: { empresaId: empresa.id }, attributes: ['id'] });
    const total = await Postulacion.count({ where: { ofertaId: ofertas.map((o) => o.id) } });
    expect(total).toBe(14);
  });
});
