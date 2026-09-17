'use strict';

/**
 * seedInstitucional.test.js — dataset institucional amplio (Fase 1.5).
 *
 * Cubre: escala mínima pedida (20 empresas, 1-3 reclutadores c/u, 60-100
 * alumnos), identidad institucional (admin_empresa nunca crea ofertas),
 * unicidad de postulaciones, integridad referencial, cronología, chats solo
 * entre usuarios relacionados, cero archivos ficticios, namespace aislado de
 * LoginPage/demo status, password nunca pública, idempotencia y --clean.
 */

const { execFileSync } = require('child_process');
const path = require('path');
const { Op } = require('sequelize');
const request = require('supertest');
const app = require('../src/app');
const {
  Usuario, Empresa, EmpresaUsuario, Oferta, Postulacion,
  PostulacionHistorialEstado, Mensaje, Notificacion, ActivityLog, Archivo,
} = require('../src/models');
const {
  escenarioInstitucionalExiste,
  ejecutarSeedInstitucional,
  limpiarSoloInstitucional,
  DOMINIO,
  EMPRESAS_COUNT,
  ALUMNOS_COUNT,
} = require('../src/utils/seedInstitucional');
const { cerrarConexion } = require('./helpers/cleanup');

const BACKEND_DIR = path.join(__dirname, '..');

jest.setTimeout(60000); // siembra ~1700 filas — más que el timeout default

describe('seedInstitucional — dataset institucional amplio (Fase 1.5)', () => {
  afterAll(async () => {
    await limpiarSoloInstitucional();
    await cerrarConexion();
  });

  test('escala mínima: 20 empresas, 1-3 reclutadores c/u, 80 alumnos/egresados (dentro de 60-100)', async () => {
    const r = await ejecutarSeedInstitucional({ verbose: false });

    expect(r.empresas).toBe(EMPRESAS_COUNT);
    expect(r.empresas).toBeGreaterThanOrEqual(20);
    expect(r.alumnos).toBe(ALUMNOS_COUNT);
    expect(r.alumnos).toBeGreaterThanOrEqual(60);
    expect(r.alumnos).toBeLessThanOrEqual(100);

    const empresaUsuarios = await EmpresaUsuario.findAll({
      include: [{ model: Empresa, as: 'empresa', attributes: ['cuit'], where: { cuit: { [Op.like]: '307000000%' } } }],
      attributes: ['empresaId', 'rolInterno'],
    });
    const porEmpresa = {};
    for (const eu of empresaUsuarios) {
      porEmpresa[eu.empresaId] = porEmpresa[eu.empresaId] || { admin_empresa: 0, reclutador: 0 };
      porEmpresa[eu.empresaId][eu.rolInterno]++;
    }
    const empresaIds = Object.keys(porEmpresa);
    expect(empresaIds).toHaveLength(EMPRESAS_COUNT);
    for (const id of empresaIds) {
      expect(porEmpresa[id].admin_empresa).toBe(1); // exactamente 1 admin_empresa por empresa
      expect(porEmpresa[id].reclutador).toBeGreaterThanOrEqual(1);
      expect(porEmpresa[id].reclutador).toBeLessThanOrEqual(3);
    }
  });

  test('identidad corporativa: cada empresa tiene razonSocial + logo (URL https), CUIT único', async () => {
    await ejecutarSeedInstitucional({ verbose: false });
    const empresas = await Empresa.findAll({ where: { cuit: { [Op.like]: '307000000%' } }, attributes: ['razonSocial', 'logo', 'cuit'] });
    expect(empresas).toHaveLength(EMPRESAS_COUNT);
    const cuits = new Set();
    for (const e of empresas) {
      expect(e.razonSocial).toBeTruthy();
      expect(e.logo).toMatch(/^https:\/\//);
      expect(cuits.has(e.cuit)).toBe(false);
      cuits.add(e.cuit);
    }
  });

  test('RBAC-01: ninguna oferta institucional fue creada por un admin_empresa', async () => {
    await ejecutarSeedInstitucional({ verbose: false });
    const empresas = await Empresa.findAll({ where: { cuit: { [Op.like]: '307000000%' } }, attributes: ['id'] });
    const empresaIds = empresas.map((e) => e.id);
    const ofertas = await Oferta.findAll({ where: { empresaId: { [Op.in]: empresaIds } }, attributes: ['creadaPorUsuarioId'] });
    expect(ofertas.length).toBeGreaterThan(0);

    const adminIds = new Set(
      (await EmpresaUsuario.findAll({ where: { empresaId: { [Op.in]: empresaIds }, rolInterno: 'admin_empresa' }, attributes: ['usuarioId'] }))
        .map((eu) => eu.usuarioId)
    );
    for (const o of ofertas) {
      expect(o.creadaPorUsuarioId).not.toBeNull();
      expect(adminIds.has(o.creadaPorUsuarioId)).toBe(false);
    }
  });

  test('postulaciones únicas (UNIQUE usuarioId+ofertaId) y sin huérfanas', async () => {
    await ejecutarSeedInstitucional({ verbose: false });
    const usuarios = await Usuario.findAll({ where: { email: { [Op.iLike]: `%@${DOMINIO}` } }, attributes: ['id'] });
    const userIds = usuarios.map((u) => u.id);
    const postulaciones = await Postulacion.findAll({ where: { usuarioId: { [Op.in]: userIds } }, attributes: ['usuarioId', 'ofertaId'] });
    expect(postulaciones.length).toBeGreaterThan(0);

    const pares = postulaciones.map((p) => `${p.usuarioId}-${p.ofertaId}`);
    expect(new Set(pares).size).toBe(pares.length);

    const ofertaIds = [...new Set(postulaciones.map((p) => p.ofertaId))];
    const ofertasExistentes = await Oferta.count({ where: { id: { [Op.in]: ofertaIds } } });
    expect(ofertasExistentes).toBe(ofertaIds.length);
  });

  test('cronología: ninguna postulación es anterior a su oferta, ningún historial anterior a su postulación', async () => {
    await ejecutarSeedInstitucional({ verbose: false });
    const usuarios = await Usuario.findAll({ where: { email: { [Op.iLike]: `%@${DOMINIO}` } }, attributes: ['id'] });
    const userIds = usuarios.map((u) => u.id);
    const postulaciones = await Postulacion.findAll({
      where: { usuarioId: { [Op.in]: userIds } },
      attributes: ['id', 'ofertaId', 'createdAt'],
      include: [{ model: Oferta, as: 'oferta', attributes: ['createdAt'] }],
    });
    expect(postulaciones.length).toBeGreaterThan(0);
    for (const p of postulaciones) {
      expect(new Date(p.createdAt).getTime()).toBeGreaterThanOrEqual(new Date(p.oferta.createdAt).getTime());
    }

    const postulacionIds = postulaciones.map((p) => p.id);
    const historial = await PostulacionHistorialEstado.findAll({
      where: { postulacionId: { [Op.in]: postulacionIds } },
      attributes: ['postulacionId', 'createdAt'],
    });
    const postCreatedAt = new Map(postulaciones.map((p) => [p.id, new Date(p.createdAt).getTime()]));
    for (const h of historial) {
      expect(new Date(h.createdAt).getTime()).toBeGreaterThanOrEqual(postCreatedAt.get(h.postulacionId));
    }
  });

  test('chats solo entre usuarios relacionados (mismo equipo, o reclutador responsable ↔ postulante real)', async () => {
    await ejecutarSeedInstitucional({ verbose: false });
    const usuarios = await Usuario.findAll({ where: { email: { [Op.iLike]: `%@${DOMINIO}` } }, attributes: ['id'] });
    const userIds = usuarios.map((u) => u.id);
    const mensajes = await Mensaje.findAll({
      where: { [Op.or]: [{ emisorId: { [Op.in]: userIds } }, { receptorId: { [Op.in]: userIds } }] },
      attributes: ['emisorId', 'receptorId'],
    });
    expect(mensajes.length).toBeGreaterThan(0);

    const membresias = await EmpresaUsuario.findAll({ attributes: ['usuarioId', 'empresaId'] });
    const empresaDeUsuario = new Map(membresias.map((m) => [m.usuarioId, m.empresaId]));
    const postulaciones = await Postulacion.findAll({
      attributes: ['usuarioId', 'ofertaId'],
      include: [{ model: Oferta, as: 'oferta', attributes: ['creadaPorUsuarioId'] }],
    });
    const paresPostulante = new Set(postulaciones.map((p) => `${p.usuarioId}-${p.oferta.creadaPorUsuarioId}`));

    for (const m of mensajes) {
      const mismoEquipo = empresaDeUsuario.has(m.emisorId) && empresaDeUsuario.has(m.receptorId)
        && empresaDeUsuario.get(m.emisorId) === empresaDeUsuario.get(m.receptorId);
      const relacionPostulacion = paresPostulante.has(`${m.emisorId}-${m.receptorId}`) || paresPostulante.has(`${m.receptorId}-${m.emisorId}`);
      expect(mismoEquipo || relacionPostulacion).toBe(true);
    }
  });

  test('notificaciones y auditoría presentes; cero archivos ficticios (CV/logo)', async () => {
    await ejecutarSeedInstitucional({ verbose: false });
    const usuarios = await Usuario.findAll({ where: { email: { [Op.iLike]: `%@${DOMINIO}` } }, attributes: ['id'] });
    const userIds = usuarios.map((u) => u.id);

    const notifs = await Notificacion.count({ where: { usuarioId: { [Op.in]: userIds } } });
    const logs = await ActivityLog.count({ where: { usuarioId: { [Op.in]: userIds } } });
    const archivos = await Archivo.count({ where: { usuarioPropietarioId: { [Op.in]: userIds } } });
    expect(notifs).toBeGreaterThan(0);
    expect(logs).toBeGreaterThan(0);
    expect(archivos).toBe(0);
  });

  test('namespace aislado: ningún usuario institucional aparece en GET /api/demo/status, ninguno tiene rol admin', async () => {
    await ejecutarSeedInstitucional({ verbose: false });

    const admins = await Usuario.count({ where: { email: { [Op.iLike]: `%@${DOMINIO}` }, rol: 'admin' } });
    expect(admins).toBe(0);

    const res = await request(app).get('/api/demo/status');
    expect(res.status).toBe(200);
    expect(res.body.accounts).toHaveLength(3);
    const emails = res.body.accounts.map((c) => c.email);
    expect(emails.some((e) => e.endsWith(`@${DOMINIO}`))).toBe(false);
  });

  test('password nunca es la pública "Demo1234!" y ningún usuario institucional puede loguearse con ella', async () => {
    await ejecutarSeedInstitucional({ verbose: false });
    const cualquiera = await Usuario.findOne({ where: { email: { [Op.iLike]: `%@${DOMINIO}` } } });
    const res = await request(app).post('/api/auth/login').send({ email: cualquiera.email, password: 'Demo1234!' });
    expect(res.status).toBe(401);
  });

  test('idempotente: correr el seed dos veces deja exactamente los mismos conteos', async () => {
    const r1 = await ejecutarSeedInstitucional({ verbose: false });
    const r2 = await ejecutarSeedInstitucional({ verbose: false });
    expect(r2).toEqual(expect.objectContaining({
      empresas: r1.empresas, reclutadores: r1.reclutadores, alumnos: r1.alumnos,
      ofertas: r1.ofertas, postulaciones: r1.postulaciones,
    }));

    const totalUsuarios = await Usuario.count({ where: { email: { [Op.iLike]: `%@${DOMINIO}` } } });
    expect(totalUsuarios).toBe(EMPRESAS_COUNT + r1.reclutadores + ALUMNOS_COUNT);
  });

  test('--clean real (subprocess): limpia el namespace sin volver a sembrar', async () => {
    await ejecutarSeedInstitucional({ verbose: false });
    expect(await escenarioInstitucionalExiste()).toBe(true);

    execFileSync('node', ['src/utils/seedInstitucional.js', '--clean'], {
      cwd: BACKEND_DIR, env: { ...process.env }, stdio: 'pipe',
    });

    expect(await escenarioInstitucionalExiste()).toBe(false);
    const total = await Usuario.count({ where: { email: { [Op.iLike]: `%@${DOMINIO}` } } });
    expect(total).toBe(0);
  });
});
