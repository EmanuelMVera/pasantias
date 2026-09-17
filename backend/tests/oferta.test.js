'use strict';
const request = require('supertest');
const app = require('../src/app');
const { Oferta, ActivityLog } = require('../src/models');
const { crearEmpresaConAdmin, crearOferta, agregarReclutador } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');
const { loginYObtenerToken } = require('./helpers/factories');

describe('OFERTA', () => {
  const idsUsuarios = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  test('reclutador de empresa B no puede editar una oferta de empresa A', async () => {
    const { usuarioAdmin: adminA, empresa: empresaA } = await crearEmpresaConAdmin();
    idsUsuarios.push(adminA.id);
    const ofertaA = await crearOferta(empresaA);
    const { empresa: empresaB } = await crearEmpresaConAdmin();
    const { usuarioReclutador: reclutadorB, passwordPlana: passB } = await agregarReclutador(empresaB);
    idsUsuarios.push(reclutadorB.id);

    const tokenB = await loginYObtenerToken(reclutadorB.email, passB);

    const res = await request(app)
      .put(`/api/ofertas/${ofertaA.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ titulo: 'Intento de edición ajena' });

    expect(res.status).toBe(404);
  });

  test('admin_empresa de empresa B no puede cerrar una oferta de empresa A', async () => {
    const { usuarioAdmin: adminA, empresa: empresaA } = await crearEmpresaConAdmin();
    idsUsuarios.push(adminA.id);
    const ofertaA = await crearOferta(empresaA);
    const { usuarioAdmin: adminB, passwordPlana: passB } = await crearEmpresaConAdmin();
    idsUsuarios.push(adminB.id);

    const tokenB = await loginYObtenerToken(adminB.email, passB);

    const res = await request(app)
      .patch(`/api/ofertas/${ofertaA.id}/estado`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ estado: 'cerrada' });

    expect(res.status).toBe(404);
  });

  test('admin_empresa no puede crear una oferta (solo reclutador — RBAC-01)', async () => {
    const { usuarioAdmin, passwordPlana } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);

    const res = await request(app)
      .post('/api/ofertas')
      .set('Authorization', `Bearer ${token}`)
      .send({ titulo: 'Intento de crear como admin_empresa', descripcion: 'Descripción de prueba.' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ROL_INSUFICIENTE');
  });

  test('admin_empresa no puede editar el contenido de una oferta de su propia empresa', async () => {
    const { usuarioAdmin, empresa, passwordPlana } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const oferta = await crearOferta(empresa);
    const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);

    const res = await request(app)
      .put(`/api/ofertas/${oferta.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ titulo: 'Intento de edición institucional' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ROL_INSUFICIENTE');
  });

  test('reclutador ajeno (mismo empresa, no responsable) no puede editar ni pausar la oferta de otro reclutador', async () => {
    const { empresa } = await crearEmpresaConAdmin();
    const { usuarioReclutador: creador, passwordPlana: passCreador } = await agregarReclutador(empresa);
    idsUsuarios.push(creador.id);
    const tokenCreador = await loginYObtenerToken(creador.email, passCreador);
    const crear = await request(app)
      .post('/api/ofertas')
      .set('Authorization', `Bearer ${tokenCreador}`)
      .send({ titulo: 'Oferta del reclutador creador', descripcion: 'Descripción de prueba.' });
    const ofertaId = crear.body.data.id;

    const { usuarioReclutador: otro, passwordPlana: passOtro } = await agregarReclutador(empresa);
    idsUsuarios.push(otro.id);
    const tokenOtro = await loginYObtenerToken(otro.email, passOtro);

    const resEditar = await request(app)
      .put(`/api/ofertas/${ofertaId}`)
      .set('Authorization', `Bearer ${tokenOtro}`)
      .send({ titulo: 'Intento ajeno' });
    expect(resEditar.status).toBe(403);
    expect(resEditar.body.code).toBe('NO_ES_RESPONSABLE');

    const resPausar = await request(app)
      .patch(`/api/ofertas/${ofertaId}/estado`)
      .set('Authorization', `Bearer ${tokenOtro}`)
      .send({ estado: 'pausada' });
    expect(resPausar.status).toBe(403);
    expect(resPausar.body.code).toBe('NO_ES_RESPONSABLE');
  });

  test('admin_empresa SÍ puede pausar/cerrar la oferta de un reclutador (control institucional)', async () => {
    const { usuarioAdmin, empresa, passwordPlana } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const { usuarioReclutador, passwordPlana: passReclutador } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);
    const tokenReclutador = await loginYObtenerToken(usuarioReclutador.email, passReclutador);
    const crear = await request(app)
      .post('/api/ofertas')
      .set('Authorization', `Bearer ${tokenReclutador}`)
      .send({ titulo: 'Oferta a pausar por admin', descripcion: 'Descripción de prueba.' });
    const ofertaId = crear.body.data.id;

    const tokenAdmin = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);
    const res = await request(app)
      .patch(`/api/ofertas/${ofertaId}/estado`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ estado: 'pausada' });

    expect(res.status).toBe(200);
    expect(res.body.data.estado).toBe('pausada');

    // Migración 015: el ENUM de Postgres y el DataTypes.ENUM del modelo deben
    // estar sincronizados, o el log se pierde en silencio (ver bug de
    // 'importar_alumnos_csv' encontrado en la auditoría — registrarAuditoria
    // traga el error y el endpoint igual responde 200).
    const log = await ActivityLog.findOne({
      where: { accion: 'pausar_oferta', entidad: 'oferta', entidadId: ofertaId },
      order: [['id', 'DESC']],
    });
    expect(log).not.toBeNull();
    expect(log.detalle.esOverrideInstitucional).toBe(true);
    expect(log.detalle.actorRolInterno).toBe('admin_empresa');
  });

  test('una oferta cerrada no se puede reactivar (transición no permitida)', async () => {
    const { empresa } = await crearEmpresaConAdmin();
    const { usuarioReclutador, passwordPlana } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);
    const token = await loginYObtenerToken(usuarioReclutador.email, passwordPlana);
    const crear = await request(app)
      .post('/api/ofertas')
      .set('Authorization', `Bearer ${token}`)
      .send({ titulo: 'Oferta a cerrar', descripcion: 'Descripción de prueba.' });
    const ofertaId = crear.body.data.id;

    await request(app)
      .patch(`/api/ofertas/${ofertaId}/estado`)
      .set('Authorization', `Bearer ${token}`)
      .send({ estado: 'cerrada' });

    const res = await request(app)
      .patch(`/api/ofertas/${ofertaId}/estado`)
      .set('Authorization', `Bearer ${token}`)
      .send({ estado: 'activa' });

    expect(res.status).toBe(400);
  });

  test('crear oferta con campos numéricos/fecha vacíos ("") no rompe (se guardan como null)', async () => {
    const { empresa } = await crearEmpresaConAdmin();
    const { usuarioReclutador, passwordPlana } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);
    const token = await loginYObtenerToken(usuarioReclutador.email, passwordPlana);

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

  test('un creadaPorUsuarioId enviado por el cliente en el body se ignora — sale exclusivamente de req.usuario.id', async () => {
    const { empresa: empresaA } = await crearEmpresaConAdmin();
    const { usuarioReclutador: reclutadorA, passwordPlana: passA } = await agregarReclutador(empresaA);
    idsUsuarios.push(reclutadorA.id);
    const { usuarioAdmin: adminB } = await crearEmpresaConAdmin(); // ajeno, otra empresa
    idsUsuarios.push(adminB.id);

    const tokenA = await loginYObtenerToken(reclutadorA.email, passA);
    const res = await request(app)
      .post('/api/ofertas')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        titulo: 'Intento de suplantar al creador',
        descripcion: 'Descripción de prueba.',
        creadaPorUsuarioId: adminB.id, // intento de asociar a un usuario ajeno
      });

    expect(res.status).toBe(201);
    const oferta = await Oferta.findByPk(res.body.data.id, { attributes: ['creadaPorUsuarioId'] });
    expect(oferta.creadaPorUsuarioId).toBe(reclutadorA.id); // nunca adminB.id
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
