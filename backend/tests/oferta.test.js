'use strict';
const request = require('supertest');
const app = require('../src/app');
const { Oferta } = require('../src/models');
const { crearEmpresaConAdmin, crearOferta, agregarReclutador } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');
const { loginYObtenerToken } = require('./helpers/factories');

describe('OFERTA', () => {
  const idsUsuarios = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  test('empresa B no puede editar una oferta de empresa A', async () => {
    const { usuarioAdmin: adminA, empresa: empresaA } = await crearEmpresaConAdmin();
    idsUsuarios.push(adminA.id);
    const ofertaA = await crearOferta(empresaA);
    const { usuarioAdmin: adminB, passwordPlana: passB } = await crearEmpresaConAdmin();
    idsUsuarios.push(adminB.id);

    const tokenB = await loginYObtenerToken(adminB.email, passB);

    const res = await request(app)
      .put(`/api/ofertas/${ofertaA.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ titulo: 'Intento de edición ajena' });

    expect(res.status).toBe(404);
  });

  test('empresa B no puede cerrar una oferta de empresa A', async () => {
    const { usuarioAdmin: adminA, empresa: empresaA } = await crearEmpresaConAdmin();
    idsUsuarios.push(adminA.id);
    const ofertaA = await crearOferta(empresaA);
    const { usuarioAdmin: adminB, passwordPlana: passB } = await crearEmpresaConAdmin();
    idsUsuarios.push(adminB.id);

    const tokenB = await loginYObtenerToken(adminB.email, passB);

    const res = await request(app)
      .delete(`/api/ofertas/${ofertaA.id}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });

  test('crear oferta con campos numéricos/fecha vacíos ("") no rompe (se guardan como null)', async () => {
    const { usuarioAdmin, passwordPlana } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);

    const res = await request(app)
      .post('/api/ofertas')
      .set('Authorization', `Bearer ${token}`)
      .send({
        titulo: 'Pasantía con campos opcionales vacíos',
        descripcion: 'Descripción de prueba.',
        tipoPuesto: 'pasante',
        salario: '',
        fechaPublicacion: '',
        fechaLimite: '',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.salario).toBeNull();
    expect(res.body.data.fechaPublicacion).toBeNull();
    expect(res.body.data.fechaLimite).toBeNull();
  });

  test('el listado público no incluye ofertas sin moderar', async () => {
    const { usuarioAdmin, empresa } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const ofertaSinModerar = await crearOferta(empresa, { moderada: false });

    const res = await request(app).get('/api/ofertas');

    expect(res.status).toBe(200);
    const ids = res.body.data.map((o) => o.id);
    expect(ids).not.toContain(ofertaSinModerar.id);
  });

  test('el detalle público de una oferta sin moderar devuelve 404 sin sesión', async () => {
    const { usuarioAdmin, empresa } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const ofertaSinModerar = await crearOferta(empresa, { moderada: false });

    const res = await request(app).get(`/api/ofertas/${ofertaSinModerar.id}`);

    expect(res.status).toBe(404);
  });

  test('el detalle público de una oferta moderada no expone el CUIT de la empresa', async () => {
    const { usuarioAdmin, empresa } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const oferta = await crearOferta(empresa);

    const res = await request(app).get(`/api/ofertas/${oferta.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.empresa.cuit).toBeUndefined();
    expect(res.body.data.empresa.razonSocial).toBe(empresa.razonSocial);
  });

  // Migración 013: creadaPorUsuarioId es solo atribución/auditoría — no
  // restringe visibilidad. Cualquier miembro de la empresa sigue viendo
  // todas las ofertas, las haya creado quien las haya creado.
  test('creadaPorUsuarioId queda seteado al creador y no filtra la visibilidad del otro rol', async () => {
    const { usuarioAdmin, empresa, passwordPlana } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const { usuarioReclutador, passwordPlana: passReclutador } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);

    const tokenReclutador = await loginYObtenerToken(usuarioReclutador.email, passReclutador);

    const res = await request(app)
      .post('/api/ofertas')
      .set('Authorization', `Bearer ${tokenReclutador}`)
      .send({ titulo: 'Pasantía creada por el reclutador', descripcion: 'Descripción de prueba.' });

    expect(res.status).toBe(201);
    const ofertaId = res.body.data.id;

    const oferta = await Oferta.findByPk(ofertaId, { attributes: ['creadaPorUsuarioId'] });
    expect(oferta.creadaPorUsuarioId).toBe(usuarioReclutador.id);

    // El admin_empresa (que no la creó) sigue viéndola en su listado.
    const tokenAdmin = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);
    const misOfertas = await request(app)
      .get('/api/empresas/mis-ofertas')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(misOfertas.status).toBe(200);
    expect(misOfertas.body.data.map((o) => o.id)).toContain(ofertaId);
  });

  test('ofertas creadas antes de la migración 013 (sin creadaPorUsuarioId) quedan con NULL', async () => {
    const { usuarioAdmin, empresa } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    // crearOferta() no setea creadaPorUsuarioId — simula una oferta histórica.
    const oferta = await crearOferta(empresa);

    const fresca = await Oferta.findByPk(oferta.id, { attributes: ['creadaPorUsuarioId'] });
    expect(fresca.creadaPorUsuarioId).toBeNull();
  });
});
